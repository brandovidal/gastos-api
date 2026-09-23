export interface StoredObject {
  data: Buffer
  contentType: string
}

// Where screenshots and voice notes live (D54): Cloudflare R2 in production, a local folder in development
export interface ObjectStorage {
  readonly driver: 'r2' | 'local'
  put(key: string, data: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<StoredObject>
  // Short-lived URL to show the file in kogane-app; null when the driver cannot sign (local)
  signedUrl(key: string, expiresInSeconds: number): Promise<string | null>
}
