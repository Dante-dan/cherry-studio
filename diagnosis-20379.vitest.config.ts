import { resolve } from 'node:path'

// Diagnostic runner only: bypasses unrelated frontend Vite plugins missing from
// this reused dependency tree. Uses current source and the pinned AI SDK versions.
export default {
  resolve: {
    alias: {
      'quick-lru': resolve('node_modules/.pnpm/quick-lru@5.1.1/node_modules/quick-lru/index.js'),
      '@shared': resolve('src/shared'),
      '@cherrystudio/ai-core/built-in/plugins': resolve('packages/aiCore/src/core/plugins/built-in'),
      '@cherrystudio/ai-core/provider': resolve('packages/aiCore/src/core/providers'),
      '@cherrystudio/ai-core': resolve('packages/aiCore/src'),
      '@cherrystudio/ai-sdk-provider': resolve('packages/ai-sdk-provider/src'),
      '@cherrystudio/provider-registry/node': resolve('packages/provider-registry/src/registry-loader'),
      '@cherrystudio/provider-registry': resolve('packages/provider-registry/src'),
      '@main': resolve('src/main'),
      '@logger': resolve('tests/__mocks__/logger')
    }
  },
  test: {
    environment: 'node',
    pool: 'forks',
    include: ['src/main/ai/provider/custom/__tests__/boundary/newapi.webSearch.test.ts']
  }
}
