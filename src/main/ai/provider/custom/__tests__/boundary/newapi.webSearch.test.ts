import { generateText } from 'ai'
import { describe, expect, it, vi } from 'vitest'

import { providerToolPlugin } from '@cherrystudio/ai-core/built-in/plugins'
import { extensionRegistry } from '@cherrystudio/ai-core/provider'
import { ENDPOINT_TYPE } from '@shared/data/types/model'
import { resolveWebToolRoutes } from '@shared/utils/provider'

import newApiPreset from '../../../../../../../packages/provider-registry/src/providers/new-api'
import { makeModel } from '../../../../__tests__/fixtures/model'
import { makeProvider } from '../../../../__tests__/fixtures/provider'
import { buildProviderBuiltinWebSearchConfig, getWebSearchParams } from '../../../../utils/websearch'
import { NewApiExtension } from '../../../extensions'
import { createNewApi } from '../../newapiProvider'

if (!extensionRegistry.has('newapi')) extensionRegistry.register(NewApiExtension)

const model = makeModel({
  id: 'relay::gemini-2.5-flash',
  apiModelId: 'gemini-2.5-flash',
  providerId: 'relay',
  name: 'Gemini 2.5 Flash',
  capabilities: ['function-call'],
  endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]
})
const provider = makeProvider({
  id: 'relay',
  presetProviderId: 'new-api',
  defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  serverTools: newApiPreset.serverTools
})

function chatResponse() {
  return Response.json({
    id: 'chatcmpl-fixture',
    object: 'chat.completion',
    created: 1,
    model: 'gemini-2.5-flash',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: 'Fresh result.',
        annotations: [{
          type: 'url_citation',
          url_citation: { url: 'https://example.org/news', title: 'News', start_index: 0, end_index: 13 }
        }]
      }
    }],
    usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
  })
}

describe('New API Gemini native web search through Chat Completions', () => {
  it('delivers a grounding request when the current route promises server search', async () => {
    const routes = resolveWebToolRoutes(model, provider, {
      webSearchEnabled: true,
      clientSearchAvailable: true,
      clientFetchAvailable: true,
      modelToolsPreferred: true,
      endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS
    })
    expect(routes.webSearch).toBe('server')
    const fetch = vi.fn<typeof globalThis.fetch>(async () => chatResponse())
    const languageModel = createNewApi({
      apiKey: 'fixture', baseURL: 'https://relay.example/v1', endpointType: 'openai', fetch
    }).languageModel('gemini-2.5-flash')
    const plugin = providerToolPlugin('webSearch', buildProviderBuiltinWebSearchConfig(
      'newapi', { maxResults: 5, excludeDomains: [] }, model, provider
    ))
    const params = await plugin.transformParams!({
      providerOptions: { newapi: getWebSearchParams(model, provider) }
    }, { providerId: 'newapi', model: languageModel } as never)

    await generateText({ ...params, model: languageModel, prompt: 'What happened today?', maxRetries: 0 })
    const body = JSON.parse(fetch.mock.calls[0][1].body as string)
    expect(body).toMatchObject({ web_search_options: {} })
  })

  it('can carry the relay-supported marker through the existing compatible SDK', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => chatResponse())
    const languageModel = createNewApi({
      apiKey: 'fixture', baseURL: 'https://relay.example/v1', endpointType: 'openai', fetch
    }).languageModel('gemini-2.5-flash')
    await generateText({
      model: languageModel,
      prompt: 'What happened today?',
      providerOptions: { newapi: { web_search_options: {} } },
      maxRetries: 0
    })
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toMatchObject({ web_search_options: {} })
  })

  it('preserves the relay grounding citations when a response includes annotations', async () => {
    const languageModel = createNewApi({
      apiKey: 'fixture', baseURL: 'https://relay.example/v1', endpointType: 'openai',
      fetch: async () => chatResponse()
    }).languageModel('gemini-2.5-flash')
    const result = await generateText({ model: languageModel, prompt: 'What happened today?', maxRetries: 0 })
    expect(result.sources).toContainEqual(expect.objectContaining({
      sourceType: 'url', url: 'https://example.org/news', title: 'News'
    }))
  })

  it('already delivers native grounding when the endpoint explicitly speaks Gemini', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      candidates: [{ content: { role: 'model', parts: [{ text: 'Fresh result.' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 }
    }))
    const languageModel = createNewApi({
      apiKey: 'fixture', baseURL: 'https://relay.example/v1beta', endpointType: 'gemini', fetch
    }).languageModel('gemini-2.5-flash')
    const params = await providerToolPlugin('webSearch').transformParams!({}, {
      providerId: 'newapi', model: languageModel
    } as never)
    await generateText({ ...params, model: languageModel, prompt: 'What happened today?', maxRetries: 0 })
    expect(JSON.parse(fetch.mock.calls[0][1].body as string).tools).toContainEqual({ googleSearch: {} })
  })
})
