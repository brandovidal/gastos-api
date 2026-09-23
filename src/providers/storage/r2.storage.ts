import { AwsClient } from 'aws4fetch'

import { StorageRequestFailedException } from '@/commons/exceptions/storage/storage-request-failed.exception'

import { ObjectStorage, StoredObject } from './storage.types'

// Cloudflare R2 through its S3-compatible API, signed with aws4fetch (no AWS SDK)
export class R2Storage implements ObjectStorage {
  readonly driver = 'r2' as const

  private readonly client: AwsClient
  private readonly baseUrl: string

  constructor(accountId: string, accessKeyId: string, secretAccessKey: string, bucket: string) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
    this.baseUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const response = await this.client.fetch(this.url(key), {
      method: 'PUT',
      body: new Uint8Array(data),
      headers: { 'content-type': contentType },
    })
    if (!response.ok) throw new StorageRequestFailedException({ operation: 'put', status: response.status })
  }

  async get(key: string): Promise<StoredObject> {
    const response = await this.client.fetch(this.url(key))
    if (!response.ok) throw new StorageRequestFailedException({ operation: 'get', status: response.status })

    return {
      data: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    }
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const url = new URL(this.url(key))
    url.searchParams.set('X-Amz-Expires', String(expiresInSeconds))
    const signed = await this.client.sign(url.toString(), { method: 'GET', aws: { signQuery: true } })
    return signed.url
  }

  private url(key: string) {
    return `${this.baseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`
  }
}
