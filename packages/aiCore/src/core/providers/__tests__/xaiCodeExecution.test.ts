import { createXai } from '@ai-sdk/xai'
import { generateText } from 'ai'
import { describe, expect, it } from 'vitest'

import { ExtensionRegistry } from '../core/ExtensionRegistry'
import { coreExtensions } from '../core/initialization'

describe('xAI native code execution', () => {
  it('sends code_interpreter and leaves execution on the provider while preserving the final answer', async () => {
    let requestBody: Record<string, unknown> | undefined
    const provider = createXai({
      apiKey: 'fixture-only',
      fetch: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body))
        return new Response(JSON.stringify({
          object: 'response', id: 'response-1', status: 'completed', model: 'grok-4.7',
          output: [
            { type: 'code_interpreter_call', id: 'code-1', status: 'completed', arguments: '{}' },
            { type: 'message', id: 'message-1', role: 'assistant', status: 'completed',
              content: [{ type: 'output_text', text: 'The code printed 4.' }] }
          ],
          usage: { input_tokens: 10, output_tokens: 10 }
        }), { headers: { 'content-type': 'application/json' } })
      }
    })
    const registry = new ExtensionRegistry()
    registry.registerAll(coreExtensions)
    const factory = registry.getToolFactory('xai-responses', 'codeExecution')!
    const tools = factory(provider)().tools!
    expect(tools.codeExecution.execute).toBeUndefined()
    const result = await generateText({ model: provider.responses('grok-4.7'), prompt: 'Run print(2 + 2)', tools })
    expect(requestBody?.tools).toEqual([{ type: 'code_interpreter' }])
    expect(result.toolCalls[0]).toMatchObject({ toolCallId: 'code-1', toolName: 'codeExecution', providerExecuted: true })
    expect(result.text).toBe('The code printed 4.')
  })
})
