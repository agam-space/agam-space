import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AppConfigService } from '../../config/config.service';
import { DatabaseService } from '../../database/database.service';
import { ServerConfigService } from '@/modules/server-info/service/server-config.service';
import { ServerConfigDto } from '@/modules/server-info/types';
import { APP_CONSTANTS } from '@/config/config.schema';
import { StorageService } from '@/modules/storage/storage.abstract';

@ApiTags('server')
@Controller('/server')
export class ServerInfoController {
  constructor(
    private configService: AppConfigService,
    private databaseService: DatabaseService,
    private readonly serverConfigService: ServerConfigService,
    private readonly storageService: StorageService
  ) {}

  @Get('/health')
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Server is healthy' })
  async getHealth() {
    const [dbHealthy, storageHealth] = await Promise.all([
      this.databaseService.healthCheck(),
      this.storageService.healthCheck(),
    ]);

    return {
      status: dbHealthy && storageHealth.healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      database: dbHealthy ? 'ok' : 'unhealthy',
      storage: storageHealth.healthy ? 'ok' : 'unhealthy',
      storageMessage: storageHealth.healthy ? undefined : storageHealth.message,
      uptime: process.uptime(),
    };
  }

  @Get('/config')
  @ApiOperation({ summary: 'Get server configuration' })
  @ApiResponse({
    status: 200,
    description: 'Server configuration retrieved successfully',
    type: ServerConfigDto,
  })
  getConfig(): ServerConfigDto {
    return this.serverConfigService.getConfig();
  }

  @Get('/info')
  @ApiOperation({ summary: 'Get server information' })
  @ApiResponse({
    status: 200,
    description: 'Server Information retrieved successfully',
  })
  getServerInfo() {
    const server = this.configService.getServer();
    return {
      version: APP_CONSTANTS.version,
      timestamp: new Date().toISOString(),
      environment: server.nodeEnv || 'production',
    };
  }
}
