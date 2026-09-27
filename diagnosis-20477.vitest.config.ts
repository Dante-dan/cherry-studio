import { resolve } from 'node:path'

export default {
  resolve: {
    alias: {
      '@cherrystudio/provider-registry': resolve('packages/provider-registry/src'),
      '@cherrystudio/ai-sdk-provider': resolve('packages/ai-sdk-provider/src'),
      '@shared': resolve('src/shared'),
      '@data': resolve('src/main/data'),
      '@main': resolve('src/main'),
      '@renderer': resolve('src/renderer'),
      '@logger': resolve('src/main/core/logger/LoggerService.ts')
    }
  },
  test: { environment: 'node', pool: 'forks', include: ['diagnosis-20477.test.ts'] }
}
