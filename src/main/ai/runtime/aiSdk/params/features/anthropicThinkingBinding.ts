import type { LanguageModelMiddleware } from 'ai'

import { definePlugin } from '@cherrystudio/ai-core'
import { ENDPOINT_TYPE } from '@shared/data/types/model'
import { getLowerBaseModelName, getRawModelId } from '@shared/utils/model'

import type { RequestFeature } from '../feature'

function createThinkingBindingMiddleware(providerOptionsKey: string): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      const hasSignedThinking = params.prompt.some(
        (message) =>
          message.role === 'assistant' &&
          message.content.some(
            (part) => part.type === 'reasoning' && typeof part.providerOptions?.anthropic?.signature === 'string'
          )
      )
      if (!hasSignedThinking) return params
      const options = params.providerOptions?.[providerOptionsKey]
      const thinking = options?.thinking
      if (thinking != null && (typeof thinking !== 'object' || Array.isArray(thinking))) return params
      if (thinking?.type != null && thinking.type !== 'adaptive') return params
      if (thinking?.blockBinding != null) return params

      // The server validates signed blocks against the exact prefix; local edits and
      // compaction must not make a stale block permanently block the conversation.
      return {
        ...params,
        providerOptions: {
          ...params.providerOptions,
          [providerOptionsKey]: {
            ...options,
            thinking: { type: 'adaptive', ...thinking, blockBinding: { prefixMismatchBehavior: 'drop_block' } }
          }
        }
      }
    }
  }
}

/** Keep valid signed history and let the Anthropic API discard invalidated blocks. */
export const anthropicThinkingBindingFeature: RequestFeature = {
  name: 'anthropic-thinking-binding',
  applies: (scope) =>
    scope.endpointType === ENDPOINT_TYPE.ANTHROPIC_MESSAGES &&
    scope.aiSdkProviderId !== 'bedrock' &&
    scope.aiSdkProviderId !== 'azure-anthropic' &&
    /(?:anthropic\.)?claude-(?:opus|sonnet|haiku)-5[.-]5(?:[@\-:][\w\-:]+)?$/.test(
      getLowerBaseModelName(getRawModelId(scope.model), '/')
    ),
  contributeModelAdapters: (scope) => [
    definePlugin({
      name: 'anthropic-thinking-binding',
      enforce: 'pre',
      configureContext: (context) => {
        context.middlewares ??= []
        context.middlewares.push(createThinkingBindingMiddleware(scope.sdkConfig.providerOptionsKey))
      }
    })
  ]
}
