import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { TrashService } from '@/modules/trash/trash.service';
import { AbstractScheduledJob } from '@/common/base.jobs';

@Injectable()
export class TrashCleanupJob extends AbstractScheduledJob {
  protected readonly intervalMinutes: number;
  protected readonly enabled: boolean;
  protected readonly jobName = 'trash-cleanup-job';

  constructor(
    private readonly trashService: TrashService,
    private readonly configService: ConfigService,
    schedulerRegistry: SchedulerRegistry
  ) {
    super(schedulerRegistry);
    this.intervalMinutes = Number(this.configService.get('FILE_CLEANUP_JOB_INTERVAL_MINUTES')) || 5;
    this.enabled = true; // This can be set based on a config value, e.g., this.configService.get('FILE_CLEANUP_JOB_ENABLED') === 'true'
  }

  protected async run(): Promise<void> {
    await this.trashService.expireOldTrashedItems();
    return this.trashService.cleanupDeletedContents();
  }
}
