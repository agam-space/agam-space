import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig, storageConfigSchema } from './config.schema';
import type { z } from 'zod';

/**
 * Wrapper around NestJS ConfigService for easier access to our configuration
 * This handles the fact that NestJS stores our config sections as separate keys
 */
@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  /**
   * Get the full configuration object
   */
  getConfig(): AppConfig {
    return {
      server: this.configService.get('server'),
      docs: this.configService.get('docs'),
      database: this.configService.get('database'),
      directories: this.configService.get('directories'),
      file: this.configService.get('file'),
      security: this.configService.get('security'),
      sso: this.configService.get('sso'),
      account: this.configService.get('account'),
      storage: this.configService.get('storage'),
    } as AppConfig;
  }

  getStorage(): z.infer<typeof storageConfigSchema> {
    return this.configService.get('storage');
  }

  /**
   * Get server configuration
   */
  getServer() {
    return this.configService.get('server');
  }

  /**
   * Get database configuration
   */
  getDatabase() {
    return this.configService.get('database');
  }

  /**
   * Get directories configuration
   */
  getDirectories() {
    return this.configService.get('directories');
  }

  /**
   * Get docs configuration
   */
  getDocs() {
    return this.configService.get('docs');
  }

  /**
   * Get security configuration
   */
  getSecurity() {
    return this.configService.get('security');
  }

  getSso() {
    return this.configService.get('sso');
  }

  /**
   * Check if docs are enabled
   */
  isDocsEnabled(): boolean {
    return this.getDocs()?.enabled || false;
  }

  /**
   * Get the API prefix
   */
  getApiPrefix(): string {
    return this.getServer()?.apiPrefix || 'api/v1';
  }

  /**
   * Get the server port
   */
  getPort(): number {
    return this.getServer()?.port || 3331;
  }

  /**
   * Get the server host
   */
  getHost(): string {
    return this.getServer()?.host || '0.0.0.0';
  }

  /**
   * Get domain value (for self-hosted, WebAuthn, etc.)
   */
  getDomain(): string {
    // Prefer explicit config, fallback to localhost
    return this.configService.get('domain.domain') || 'localhost';
  }

  /**
   * Get WebAuthn config (origin and rpId)
   */
  getWebauthnConfig(): { origin: string; rpId: string } {
    const domain = this.getDomain();
    // Origin: full URL (protocol + domain + port)
    const origin = this.configService.get('webauthn.origin') || domain;
    // RP ID: domain only, no protocol/port
    const rpId =
      this.configService.get('webauthn.rpId') ||
      domain.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
    return { origin, rpId };
  }
}
