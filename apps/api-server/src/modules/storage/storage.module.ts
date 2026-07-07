import { Module } from '@nestjs/common';

import { AppConfigModule } from '@/config/config.module';
import { AppConfigService } from '@/config/config.service';

import { StorageService } from './storage.abstract';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';

@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: StorageService,
      useFactory: (config: AppConfigService): StorageService => {
        const backend = config.getStorage()?.backend ?? 'local';
        if (backend === 's3') {
          return new S3StorageService(config);
        }
        return new LocalStorageService(config);
      },
      inject: [AppConfigService],
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
