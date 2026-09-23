import { Logger, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { StorageConfig } from '@/settings/settings.model'

import { LocalStorage } from './local.storage'
import { R2Storage } from './r2.storage'
import { ObjectStorage } from './storage.types'

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE')

@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): ObjectStorage => {
        const config = configService.getOrThrow<StorageConfig>('storage')
        const { r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2Bucket, localDir } = config

        if (r2AccountId && r2AccessKeyId && r2SecretAccessKey) {
          return new R2Storage(r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2Bucket)
        }
        new Logger('StorageModule').warn(`R2 keys not set: files are stored in ${localDir}`)
        return new LocalStorage(localDir)
      },
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageProviderModule {}
