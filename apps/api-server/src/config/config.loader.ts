import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  accountConfigSchema,
  APP_CONSTANTS,
  type AppConfig,
  configSchema,
  databaseConfigSchema,
  docsConfigSchema,
  fileConfigSchema,
  securityConfigSchema,
  serverConfigSchema,
} from './config.schema';
import { loadFromEnvironment } from '@/config/env.loader';

interface ConfigOptions {
  configFile?: string;
  validateOnly?: boolean;
}

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: AppConfig | null = null;

  private constructor() {}

  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  static resetInstance(): void {
    if (ConfigLoader.instance) {
      ConfigLoader.instance.config = null;
    }
  }

  /**
   * Bootstrap and load configuration
   * This is the main entry point that follows the user's plan
   */
  loadConfig(options: ConfigOptions = {}): AppConfig {
    if (this.config && !options.validateOnly) {
      return this.config;
    }

    console.log('Bootstrapping Agam Space...');

    // Step 1: Load ENV
    const envConfig = loadFromEnvironment();

    // Step 2: Load config.json from CONFIG_DIR
    const fileConfig = this.loadOrCreateConfigFile(options.configFile ?? this.getConfigFilePath());

    const merged = this.mergeConfigs(envConfig, fileConfig, {});

    // Step 3: Validate DATA_DIR early
    this.validateDataDir(merged);

    // Step 4: Resolve final directory paths
    const resolvedDirs = this.resolveDirectoryPaths(merged);

    // Step 5: Ensure all paths exist
    const dirsCreated = this.createRequiredDirectories(resolvedDirs);

    // Step 6: Update merged config with resolved directories
    merged.directories = resolvedDirs;

    try {
      const validatedConfig = configSchema.parse(merged);

      this.logConfigSummary(validatedConfig, dirsCreated);

      this.config = validatedConfig;
      return validatedConfig;
    } catch (error) {
      console.error('❌ Configuration validation failed:');
      if (error instanceof Error) {
        console.error(error.message);
      }
      throw new Error(`Invalid configuration: ${error}`, { cause: error });
    }
  }

  /**
   * Step 2: Validate that DATA_DIR is provided (fail fast)
   */
  private validateDataDir(envConfig: any): void {
    const envDataDir = envConfig?.directories?.dataDir || process.env.DATA_DIR;
    let resolvedDataDir: string;

    if (envDataDir) {
      // Priority 1: Use DATA_DIR from environment
      resolvedDataDir = this.resolvePath(envDataDir);
      console.log(`✅ DATA_DIR (from env): ${resolvedDataDir}`);
    } else {
      // Priority 2: Try default Docker path
      const dockerDataDir = '/data';

      // This catches Docker permission issues early with helpful error messages
      if (!this.canCreateAndWriteToDirectory(dockerDataDir)) {
        console.error('');
        console.error('❌ DATA_DIR validation failed!');
        console.error(`   Cannot write to ${dockerDataDir}`);
        console.error('');
        console.error(
          'The application requires write access to /data for storing encrypted file chunks.'
        );
        console.error('');
        console.error('Solutions:');
        console.error('  1. Ensure /data volume is mounted:');
        console.error('     docker run -v /path/to/data:/data ...');
        console.error('');
        console.error('  2. Run container with your user ID:');
        console.error('     docker run --user $(id -u):$(id -g) ...');
        console.error('');
        console.error('  3. OR change ownership on host:');
        console.error('     sudo chown -R 65532:65532 /path/to/data');
        console.error('');
        console.error('  4. Docker Compose: Add user field:');
        console.error('     services:');
        console.error('       agam:');
        console.error('         user: "1000:1000"');
        console.error('');

        // Force immediate exit - use setImmediate to ensure logs are flushed
        // This prevents NestJS module loader from catching and suppressing the exit
        setImmediate(() => process.exit(1));

        // Also throw to stop execution immediately
        throw new Error('DATA_DIR validation failed - insufficient permissions');
      }

      resolvedDataDir = dockerDataDir;
      console.log(`✅ DATA_DIR (default): ${resolvedDataDir}`);
    }

    // Store the resolved DATA_DIR for later use
    if (!envConfig.directories) {
      envConfig.directories = {};
    }
    envConfig.directories.dataDir = resolvedDataDir;
  }

  private getConfigFilePath(): string {
    const configDir = process.env.CONFIG_DIR || '/config';
    return join(configDir, 'config.json');
  }

  /**
   * Ensure directory exists and test write permissions
   * Returns true only if we can both create the directory and write to it
   */
  private canCreateAndWriteToDirectory(path: string): boolean {
    try {
      // Create directory if it doesn't exist
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }

      // Always test write permissions by creating and deleting a temp file
      // This validates even if directory already existed
      const testFile = join(path, '.write-test-' + Date.now());
      try {
        writeFileSync(testFile, 'test');
        unlinkSync(testFile);
        return true;
      } catch (writeErr) {
        console.error(
          `   Directory exists but is not writable: ${writeErr instanceof Error ? writeErr.message : writeErr}`
        );
        return false;
      }
    } catch {
      // Could not create directory or test write
      return false;
    }
  }

  /**
   * Step 3: Resolve final directory paths with defaults
   */
  private resolveDirectoryPaths(envConfig: any): any {
    // DATA_DIR was already resolved and set in validateDataDir
    const dataDir = this.resolvePath(envConfig.directories.dataDir);

    return {
      dataDir,
      filesDir: envConfig?.directories?.filesDir
        ? this.resolvePath(envConfig.directories.filesDir)
        : join(dataDir, 'files'),
      configDir: envConfig?.directories?.configDir
        ? this.resolvePath(envConfig.directories.configDir)
        : join(dataDir, 'config'),
      logDir: envConfig?.directories?.logDir
        ? this.resolvePath(envConfig.directories.logDir)
        : join(dataDir, 'logs'),
      cacheDir: envConfig?.directories?.cacheDir
        ? this.resolvePath(envConfig.directories.cacheDir)
        : join(dataDir, 'cache'),
    };
  }

  /**
   * Step 4: Ensure all directory paths exist
   */
  private createRequiredDirectories(dirs: any): string[] {
    const createdDirs: string[] = [];

    for (const [name, path] of Object.entries(dirs)) {
      try {
        if (!existsSync(path as string)) {
          mkdirSync(path as string, { recursive: true });
          createdDirs.push(`${name}: ${path}`);
        }
      } catch (error) {
        console.error(
          `❌ Failed to create ${name} directory ${path}:`,
          error instanceof Error ? error.message : error
        );
        throw error;
      }
    }

    if (createdDirs.length > 0) {
      console.log('📂 Created directories:');
      for (const dir of createdDirs) console.log(`   ✅ ${dir}`);
    }

    return createdDirs;
  }

  /**
   * Step 5: Load config.json from CONFIG_DIR or create default
   */
  private loadOrCreateConfigFile(configPath: string): any {
    try {
      if (existsSync(configPath)) {
        console.log(`Loading configuration file from ${configPath}`);
        const content = readFileSync(configPath, 'utf8');
        return JSON.parse(content);
      } else {
        return {};
      }
    } catch (error) {
      console.error(
        `❌ Failed to fetch config file ${configPath}:`,
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  }

  /**
   * Generate default configuration using individual Zod schema defaults
   */
  private getDefaultConfigFromSchema(): Partial<AppConfig> {
    // Parse each schema section with empty object to get Zod defaults
    const serverDefaults = serverConfigSchema.partial().parse({});
    const docsDefaults = docsConfigSchema.partial().parse({});
    const databaseDefaults = databaseConfigSchema.partial().parse({});
    const securityDefaults = securityConfigSchema.partial().parse({});
    const fileDefaults = fileConfigSchema.partial().parse({});
    const accountDefaults = accountConfigSchema.partial().parse({});

    return {
      server: serverDefaults,
      docs: docsDefaults,
      database: databaseDefaults,
      security: securityDefaults,
      file: fileDefaults,
      account: accountDefaults,
    } as Partial<AppConfig>;
  }

  /**
   * Step 6: Merge configurations with precedence DEFAULTS → CONFIG_FILE → ENV
   */
  private mergeConfigs(envConfig: any, fileConfig: any, resolvedDirs: any): Partial<AppConfig> {
    // Start with schema defaults (this ensures backward compatibility)
    const schemaDefaults = this.getDefaultConfigFromSchema();

    // Start with directory config and schema defaults
    const baseConfig = {
      directories: resolvedDirs,
      ...schemaDefaults,
    };

    // Apply file config (overrides defaults)
    this.deepMerge(baseConfig, fileConfig);

    // Apply env config (highest priority - overrides everything)
    this.deepMerge(baseConfig, envConfig);

    return baseConfig;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): void {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }

  /**
   * Resolve path with support for ~ and relative paths
   */
  private resolvePath(path: string): string {
    if (path.startsWith('~/')) {
      return resolve(homedir(), path.slice(2));
    }
    if (!path.startsWith('/')) {
      return resolve(process.cwd(), path);
    }
    return path;
  }

  /**
   * Step 7: Log configuration summary
   */
  private logConfigSummary(config: AppConfig, createdDirs: string[]): void {
    console.log('\n📋 Configuration Summary:');
    console.log(`   App: Agam Space API v${APP_CONSTANTS.version}`);
    console.log(`   Server: ${config.server.host}:${config.server.port}`);
    console.log(`   Environment: ${config.server.nodeEnv}`);
    console.log(`   API Prefix: /${config.server.apiPrefix}`);
    console.log(`   Data Directory: ${config.directories.dataDir}`);
    console.log(
      `   Database: ${config.database.host}:${config.database.port}/${config.database.database}`
    );
    if (config.docs.enabled) {
      console.log(`   API Docs: /${config.docs.path}`);
    }

    const isFirstTime = createdDirs.length > 0;
    if (isFirstTime) {
      console.log('🎉 First-time setup complete!\n');
    } else {
      console.log('✅ Bootstrap complete!\n');
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AppConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  /**
   * Validate configuration without loading
   */
  validateConfig(configData: any): { valid: boolean; errors?: string[] } {
    try {
      configSchema.parse(configData);
      return { valid: true };
    } catch (error) {
      const errors = error instanceof Error ? [error.message] : ['Unknown validation error'];
      return { valid: false, errors };
    }
  }
}

// Export singleton instance
export const configLoader = ConfigLoader.getInstance();
