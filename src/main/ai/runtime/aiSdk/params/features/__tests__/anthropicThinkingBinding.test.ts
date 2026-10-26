import { createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModelV3CallOptions } from '@ai-sdk/provider'
import type { LanguageModelMiddleware } from 'ai'
import { describe, expect, it } from 'vitest'

import { ENDPOINT_TYPE } from '@shared/data/types/model'

import { makeModel } from '../../../../../__tests__/fixtures'
import type { RequestScope } from '../../scope'
import { INTERNAL_FEATURES } from '../internalFeatures'

const history: LanguageModelV3CallOptions['prompt'] = [
  { role: 'system', content: 'Changed system prompt.' },
  { role: 'user', content: [{ type: 'text', text: 'Edited earlier question.' }] },
  {
    role: 'assistant',
    content: [
      { type: 'reasoning', text: 'Original thinking.', providerOptions: { anthropic: { signature: 'old-prefix' } } },
      { type: 'text', text: 'Original answer.' }
    ]
  },
  { role: 'user', content: [{ type: 'text', text: 'Continue.' }] }
]

async function send({
  modelId = 'claude-opus-5-5',
  endpointType = ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  aiSdkProviderId = 'anthropic',
  prompt = history,
  thinking = { type: 'adaptive', display: 'summarized' }
}: {
  modelId?: string
  endpointType?: RequestScope['endpointType']
  aiSdkProviderId?: RequestScope['aiSdkProviderId']
  prompt?: LanguageModelV3CallOptions['prompt']
  thinking?: Record<string, any>
} = {}) {
  const scope = {
    model: makeModel({ id: modelId, apiModelId: modelId }),
    endpointType,
    aiSdkProviderId,
    sdkConfig: { providerOptionsKey: 'anthropic' }
  } as RequestScope
  let params: LanguageModelV3CallOptions = { prompt, providerOptions: { anthropic: { thinking } } }
  const feature = INTERNAL_FEATURES.find((item) => item.name === 'anthropic-thinking-binding')
  const context = { middlewares: [] as LanguageModelMiddleware[] }
  if (feature?.applies?.(scope)) {
    for (const plugin of feature.contributeModelAdapters!(scope)) {
      await plugin.configureContext?.(context as any)
    }
  }
  for (const middleware of context.middlewares) {
    params = await middleware.transformParams!({ type: 'generate', params, model: {} as any })
  }
  let body: Record<string, any> = {}
  let headers = new Headers()
  await createAnthropic({
    apiKey: 'test',
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body))
      headers = new Headers(init?.headers)
      return new Response('{}')
    }
  })(modelId).doStream(params)
  return { body, headers, params }
}

describe('Anthropic signed thinking replay', () => {
  it.each(['claude-opus-5-5', 'claude-sonnet-5-5', 'anthropic/claude-haiku-5.5'])(
    'lets the API drop invalidated blocks for %s without rewriting history',
    async (modelId) => {
      const { body, headers, params } = await send({ modelId })
      expect(body.thinking.block_binding).toEqual({ prefix_mismatch_behavior: 'drop_block' })
      expect(headers.get('anthropic-beta')).toContain('thinking-binding-controls-2026-08-01')
      expect(params.prompt).toEqual(history)
      expect(body.messages[1].content[0]).toEqual({
        type: 'thinking',
        thinking: 'Original thinking.',
        signature: 'old-prefix'
      })
      expect(body.messages[1].content[1]).toEqual({ type: 'text', text: 'Original answer.' })
    }
  )

  it('preserves an explicit error policy and the other thinking settings', async () => {
    const { body } = await send({
      thinking: { type: 'adaptive', display: 'summarized', blockBinding: { prefixMismatchBehavior: 'error' } }
    })
    expect(body.thinking).toEqual({
      type: 'adaptive',
      display: 'summarized',
      block_binding: { prefix_mismatch_behavior: 'error' }
    })
  })

  it.each([{ type: 'between_tools' }, { type: 'disabled' }])(
    'does not change thinking mode $type',
    async (thinking) => {
      const { body } = await send({ modelId: 'claude-sonnet-5-5', thinking })
      expect(body.thinking).not.toHaveProperty('block_binding')
    }
  )

  it.each([
    { modelId: 'claude-opus-4-6' },
    { aiSdkProviderId: 'azure-anthropic' as const },
    { aiSdkProviderId: 'bedrock' as const },
    { endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS },
    { prompt: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Fresh question.' }] }] }
  ])('does not opt unsupported routes or unsigned histories into the beta: %j', async (options) => {
    const { body, headers } = await send(options)
    expect(body.thinking).not.toHaveProperty('block_binding')
    expect(headers.get('anthropic-beta') ?? '').not.toContain('thinking-binding-controls-2026-08-01')
  })
})
