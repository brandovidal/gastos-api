import { VersioningOptions, VersioningType } from '@nestjs/common'

export const VERSIONING_OPTIONS: VersioningOptions = { type: VersioningType.URI, defaultVersion: '1' }
