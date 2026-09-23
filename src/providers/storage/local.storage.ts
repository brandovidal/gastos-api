import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'

import { StorageRequestFailedException } from '@/commons/exceptions/storage/storage-request-failed.exception'

import { ObjectStorage, StoredObject } from './storage.types'

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.webm': 'audio/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
}

// Local development without R2 keys: files in a git-ignored folder
export class LocalStorage implements ObjectStorage {
  readonly driver = 'local' as const

  private readonly root: string

  constructor(dir: string) {
    this.root = resolve(dir)
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.path(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data)
  }

  async get(key: string): Promise<StoredObject> {
    try {
      const data = await readFile(this.path(key))
      return { data, contentType: CONTENT_TYPES[extname(key).toLowerCase()] ?? 'application/octet-stream' }
    } catch {
      throw new StorageRequestFailedException({ operation: 'get', key })
    }
  }

  async signedUrl(): Promise<null> {
    return null
  }

  // Keys never leave the storage folder
  private path(key: string) {
    const path = resolve(join(this.root, key))
    if (!path.startsWith(this.root)) throw new StorageRequestFailedException({ operation: 'path', key })
    return path
  }
}
