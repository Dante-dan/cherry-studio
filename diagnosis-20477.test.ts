import { describe, expect, it, vi } from 'vitest'
vi.mock('@logger', async () => (await import('./tests/__mocks__/MainLoggerService')).default)
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformBlocksToParts, type OldBlock } from './src/main/data/migration/v2/migrators/mappings/ChatMappings'
import { fileHandleFromPart } from './src/renderer/utils/file/fileHandle'
import { legacyStorageNames } from './src/main/data/migration/v2/migrators/mappings/legacyFileMappings'

const id = '550e8400-e29b-41d4-a716-446655440000'

describe('synthetic Windows v1 attachment migration', () => {
  it.each([
    ['txt', Buffer.from('synthetic text\n')],
    ['py', Buffer.from('print("synthetic")\n')],
    ['bin', Buffer.from([0, 255, 128, 1])]
  ] as const)('locates intact restored %s bytes from legacy id/ext', (ext, bytes) => {
    const dir = mkdtempSync(join(tmpdir(), 'cherry-20477-blob-'))
    try {
      writeFileSync(join(dir, `${id}.${ext}`), bytes)
      const name = legacyStorageNames({ id, ext: `.${ext}` }).find((candidate) => existsSync(join(dir, candidate)))
      expect(name).toBeDefined()
      expect(readFileSync(join(dir, name!))).toEqual(bytes)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })
  it.each(['txt', 'py', 'jpg', 'bin'])('retains a durable entry handle for %s', async (ext) => {
    const block = {
      id: `block-${ext}`, messageId: 'message-1', type: ext === 'jpg' ? 'image' : 'file',
      status: 'success', createdAt: '2026-01-01T00:00:00Z',
      file: { id, name: `${id}.${ext}`, origin_name: `sample.${ext}`, ext: `.${ext}`,
        path: `C:\\Users\\Old\\Data\\Files\\${id}.${ext}`, size: 4, type: ext === 'jpg' ? 'image' : 'document', count: 1 }
    } as OldBlock
    const { parts } = await transformBlocksToParts([block])
    expect(parts).toHaveLength(1)
    expect(fileHandleFromPart(parts[0])).toEqual({ kind: 'entry', entryId: id })
  })

  it('keeps a restored disk image reachable through the migrated image URL', async () => {
    const currentFilesDir = mkdtempSync(join(tmpdir(), 'cherry-20477-image-'))
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=', 'base64')
    writeFileSync(join(currentFilesDir, `${id}.png`), png)
    const block = {
      id: 'block-image', messageId: 'message-1', type: 'image', status: 'success',
      file: { id, name: `${id}.png`, origin_name: 'sample.png', ext: '.png',
        path: `/previous-machine/Data/Files/${id}.png`, size: png.length, type: 'image', count: 1 }
    } as OldBlock
    try {
      const { parts } = await transformBlocksToParts([block])
      const part = parts[0]
      if (part.type !== 'file') throw new Error('Expected migrated image file part')
      expect(existsSync(fileURLToPath(part.url))).toBe(true)
    } finally {
      rmSync(currentFilesDir, { recursive: true })
    }
  })
})
