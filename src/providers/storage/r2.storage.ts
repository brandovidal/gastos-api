import { AwsClient } from 'aws4fetch'

import { StorageRequestFailedException } from '@/commons/exceptions/storage/storage-request-failed.exception'

import { ObjectStorage, StoredObject } from './storage.types'

// Cloudflare R2 through its S3-compatible API, signed with aws4fetch (no AWS SDK)
export class R2Storage implements ObjectStorage {
  readonly driver = 'r2' as const

  private readonly client: AwsClient
  private readonly baseUrl: string
  private readonly bucket: string

  constructor(accountId: string, accessKeyId: string, secretAccessKey: string, bucket: string) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
    this.bucket = bucket
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

  // S3 CopyObject: R2 copies inside the bucket, nothing is downloaded
  async copy(fromKey: string, toKey: string): Promise<void> {
    const response = await this.client.fetch(this.url(toKey), {
      method: 'PUT',
      headers: { 'x-amz-copy-source': `/${this.bucket}/${this.encodeKey(fromKey)}` },
    })
    if (!response.ok) throw new StorageRequestFailedException({ operation: 'copy', status: response.status })
  }

  async delete(key: string): Promise<void> {
    const response = await this.client.fetch(this.url(key), { method: 'DELETE' })
    // 404: already gone (e.g. removed by the bucket lifecycle rule)
    if (!response.ok && response.status !== 404) {
      throw new StorageRequestFailedException({ operation: 'delete', status: response.status })
    }
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const url = new URL(this.url(key))
    url.searchParams.set('X-Amz-Expires', String(expiresInSeconds))
    const signed = await this.client.sign(url.toString(), { method: 'GET', aws: { signQuery: true } })
    return signed.url
  }

  private url(key: string) {
    return `${this.baseUrl}/${this.encodeKey(key)}`
  }

  private encodeKey(key: string) {
    return key.split('/').map(encodeURIComponent).join('/')
  }
}
