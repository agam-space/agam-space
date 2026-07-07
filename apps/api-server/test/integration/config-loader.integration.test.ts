import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { ConfigLoader } from '../../src/config/config.loader';

describe('ConfigLoader Integration', () => {
  const TEST_BASE_DIR = join(__dirname, '..', '..', '.test-config');
  const TEST_DATA_DIR = join(TEST_BASE_DIR, 'data');
  const TEST_CONFIG_DIR = join(TEST_BASE_DIR, 'config');
  const TEST_CONFIG_FILE = join(TEST_CONFIG_DIR, 'config.json');

  const originalEnv = { ...process.env };

  const ALL_ENV_VARS = [
    'HTTP_PORT',
    'HTTP_HOST',
    'NODE_ENV',
    'API_PREFIX',
    'DOCS_ENABLED',
    'DOCS_PATH',
    'DATABASE_HOST',
    'DATABASE_PORT',
    'DATABASE_USERNAME',
    'DATABASE_PASSWORD',
    'DATABASE_NAME',
    'DATABASE_SSL',
    'DATABASE_MAX_CONNECTIONS',
    'DATABASE_CONNECTION_TIMEOUT',
    'DATA_DIR',
    'FILES_DIR',
    'CONFIG_DIR',
    'LOG_DIR',
    'CACHE_DIR',
    'MAX_FILE_SIZE',
    'CHUNK_SIZE',
    'TRASH_CLEANUP_INTERVAL_DAYS',
    'SESSION_TIMEOUT',
    'ALLOW_NEW_SIGNUP',
    'DEFAULT_USER_STORAGE_QUOTA',
    'ALLOW_CORS_FOR_INTEGRITY_VERIFICATION',
    'SSO_ISSUER',
    'SSO_CLIENT_ID',
    'SSO_CLIENT_SECRET',
    'SSO_REDIRECT_URI',
    'SSO_AUTO_CREATE_USER',
    'DOMAIN',
    'WEBAUTHN_ORIGIN',
    'WEBAUTHN_RPID',
    'STORAGE_BACKEND',
    'S3_BUCKET',
    'S3_REGION',
    'S3_ENDPOINT',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_PATH_STYLE_ENDPOINT',
  ];

  beforeAll(() => {
    if (!existsSync(TEST_BASE_DIR)) {
      mkdirSync(TEST_BASE_DIR, { recursive: true });
    }
    if (!existsSync(TEST_CONFIG_DIR)) {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    if (existsSync(TEST_BASE_DIR)) {
      rmSync(TEST_BASE_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    ConfigLoader.resetInstance();

    for (const envVar of ALL_ENV_VARS) {
      delete process.env[envVar];
    }

    process.env.DATA_DIR = TEST_DATA_DIR;
    process.env.DATABASE_HOST = 'localhost';
    process.env.DATABASE_USERNAME = 'test_user';
    process.env.DATABASE_PASSWORD = 'test_password';
  });

  afterEach(() => {
    if (existsSync(TEST_CONFIG_FILE)) {
      unlinkSync(TEST_CONFIG_FILE);
    }

    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }

    for (const envVar of ALL_ENV_VARS) {
      delete process.env[envVar];
    }

    if (originalEnv.DATA_DIR) {
      process.env.DATA_DIR = originalEnv.DATA_DIR;
    }
  });

  function getConfigLoader() {
    return ConfigLoader.getInstance();
  }

  describe('Scenario 1: Defaults', () => {
    it('should load default values for server configuration', () => {
      const config = getConfigLoader().loadConfig();

      expect(config.server.port).toBe(3331);
      expect(config.server.host).toBe('0.0.0.0');
      expect(config.server.nodeEnv).toBe('production');
      expect(config.server.apiPrefix).toBe('api/v1');
    });

    it('should load default values for docs configuration', () => {
      const config = getConfigLoader().loadConfig();

      expect(config.docs.enabled).toBe(false);
      expect(config.docs.path).toBe('docs');
    });

    it('should load default values for database configuration', () => {
      const config = getConfigLoader().loadConfig();

      expect(config.database.port).toBe(5432);
      expect(config.database.database).toBe('agam_space');
      expect(config.database.ssl).toBe(false);
      expect(config.database.maxConnections).toBe(100);
      expect(config.database.connectionTimeout).toBe(30_000);
    });

    it('should load default values for file configuration', () => {
      const config = getConfigLoader().loadConfig();

      expect(config.file.maxFileSize).toBe(1_000_000_000);
      expect(config.file.chunkSize).toBe(8_000_000);
      expect(config.file.uploadConcurrency).toBe(2);
      expect(config.file.trashCleanupIntervalDays).toBe(7);
    });

    it('should load default values for security configuration', () => {
      const config = getConfigLoader().loadConfig();

      expect(config.security.sessionTimeout).toBe('7d');
      expect(config.security.sessionDurationDays).toBe(30);
      expect(config.security.maxSessionsPerUser).toBe(10);
      expect(config.security.cleanupIntervalHours).toBe(24);
    });

    it('should load default values for account configuration', () => {
      const config = getConfigLoader().loadConfig();

      expect(config.account.allowNewSignup).toBe(true);
      expect(config.account.defaultUserStorageQuota).toBe(10_000_000_000);
    });

    it('should load default values for integrity verification configuration', () => {
      const config = getConfigLoader().loadConfig();

      expect(config.integrityVerification.allowCorsForVerification).toBe(true);
    });

    it('should load default values for domain configuration', () => {
      const config = getConfigLoader().loadConfig();

      expect(config.domain.domain).toBe('localhost');
    });

    it('should set DATA_DIR from environment', () => {
      const config = getConfigLoader().loadConfig();

      expect(config.directories.dataDir).toBe(TEST_DATA_DIR);
    });

    it('should resolve derived directory paths when not explicitly set', () => {
      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.directories.filesDir).toBe(join(TEST_DATA_DIR, 'files'));
      expect(config.directories.configDir).toBe(join(TEST_DATA_DIR, 'config'));
      expect(config.directories.logDir).toBe(join(TEST_DATA_DIR, 'logs'));
      expect(config.directories.cacheDir).toBe(join(TEST_DATA_DIR, 'cache'));
    });

    it('should use default directory structure relative to DATA_DIR', () => {
      const customDataDir = join(TEST_BASE_DIR, 'custom-default-structure');
      process.env.DATA_DIR = customDataDir;

      delete process.env.FILES_DIR;
      delete process.env.CONFIG_DIR;
      delete process.env.LOG_DIR;
      delete process.env.CACHE_DIR;

      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.directories.dataDir).toBe(customDataDir);
      expect(config.directories.filesDir).toBe(join(customDataDir, 'files'));
      expect(config.directories.configDir).toBe(join(customDataDir, 'config'));
      expect(config.directories.logDir).toBe(join(customDataDir, 'logs'));
      expect(config.directories.cacheDir).toBe(join(customDataDir, 'cache'));
    });
  });

  describe('Scenario 2: Full Environment Variable Override', () => {
    beforeEach(() => {
      process.env.HTTP_PORT = '4000';
      process.env.HTTP_HOST = '127.0.0.1';
      process.env.NODE_ENV = 'development';
      process.env.API_PREFIX = 'v2/api';
      process.env.DOCS_ENABLED = 'true';
      process.env.DOCS_PATH = 'documentation';

      process.env.DATABASE_HOST = 'postgres.example.com';
      process.env.DATABASE_PORT = '5433';
      process.env.DATABASE_USERNAME = 'testuser';
      process.env.DATABASE_PASSWORD = 'testpass123';
      process.env.DATABASE_NAME = 'test_db';
      process.env.DATABASE_SSL = 'true';
      process.env.DATABASE_MAX_CONNECTIONS = '50';
      process.env.DATABASE_CONNECTION_TIMEOUT = '60000';

      process.env.FILES_DIR = join(TEST_BASE_DIR, 'custom-files');
      process.env.CONFIG_DIR = TEST_CONFIG_DIR;
      process.env.LOG_DIR = join(TEST_BASE_DIR, 'custom-logs');
      process.env.CACHE_DIR = join(TEST_BASE_DIR, 'custom-cache');

      process.env.MAX_FILE_SIZE = '5000000000';
      process.env.CHUNK_SIZE = '16000000';
      process.env.TRASH_CLEANUP_INTERVAL_DAYS = '14';

      process.env.SESSION_TIMEOUT = '14d';

      process.env.ALLOW_NEW_SIGNUP = 'false';
      process.env.DEFAULT_USER_STORAGE_QUOTA = '20000000000';

      process.env.ALLOW_CORS_FOR_INTEGRITY_VERIFICATION = 'false';

      process.env.DOMAIN = 'example.com';

      process.env.WEBAUTHN_ORIGIN = 'https://example.com';
      process.env.WEBAUTHN_RPID = 'example.com';
    });

    it('should load all server environment variables correctly', () => {
      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.server.port).toBe(4000);
      expect(config.server.host).toBe('127.0.0.1');
      expect(config.server.nodeEnv).toBe('development');
      expect(config.server.apiPrefix).toBe('v2/api');
    });

    it('should load all docs environment variables correctly', () => {
      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.docs.enabled).toBe(true);
      expect(config.docs.path).toBe('documentation');
    });

    it('should load all database environment variables correctly', () => {
      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.database.host).toBe('postgres.example.com');
      expect(config.database.port).toBe(5433);
      expect(config.database.username).toBe('testuser');
      expect(config.database.password).toBe('testpass123');
      expect(config.database.database).toBe('test_db');
      expect(config.database.ssl).toBe(true);
      expect(config.database.maxConnections).toBe(50);
      expect(config.database.connectionTimeout).toBe(60000);
    });

    it('should load all directory environment variables correctly', () => {
      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.directories.dataDir).toBe(TEST_DATA_DIR);
      expect(config.directories.filesDir).toBe(join(TEST_BASE_DIR, 'custom-files'));
      expect(config.directories.logDir).toBe(join(TEST_BASE_DIR, 'custom-logs'));
      expect(config.directories.cacheDir).toBe(join(TEST_BASE_DIR, 'custom-cache'));
    });

    it('should load all file environment variables correctly', () => {
      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.file.maxFileSize).toBe(5_000_000_000);
      expect(config.file.chunkSize).toBe(16_000_000);
      expect(config.file.trashCleanupIntervalDays).toBe(14);
    });

    it('should load all security environment variables correctly', () => {
      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.security.sessionTimeout).toBe('14d');
    });

    it('should load all account environment variables correctly', () => {
      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.account.allowNewSignup).toBe(false);
      expect(config.account.defaultUserStorageQuota).toBe(20_000_000_000);
    });

    it('should load all integrity verification environment variables correctly', () => {
      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.integrityVerification.allowCorsForVerification).toBe(false);
    });

    it('should load all domain environment variables correctly', () => {
      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.domain.domain).toBe('example.com');
    });

    it('should load all webauthn environment variables correctly', () => {
      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.webauthn?.origin).toBe('https://example.com');
      expect(config.webauthn?.rpId).toBe('example.com');
    });
  });

  describe('Scenario 3: Full Config File Override', () => {
    beforeEach(() => {
      delete process.env.DATABASE_HOST;
      delete process.env.DATABASE_USERNAME;
      delete process.env.DATABASE_PASSWORD;

      process.env.DATA_DIR = TEST_DATA_DIR;

      const fileConfig = {
        domain: {
          domain: 'myapp.com',
        },
        server: {
          port: 5555,
          host: '192.168.1.1',
          nodeEnv: 'development',
          apiPrefix: 'api/v3',
        },
        docs: {
          enabled: true,
          path: 'api-docs',
        },
        database: {
          host: 'db.local',
          port: 5433,
          username: 'admin',
          password: 'secretpass',
          database: 'myapp_db',
          ssl: true,
          maxConnections: 75,
          connectionTimeout: 45000,
        },
        directories: {
          filesDir: join(TEST_BASE_DIR, 'file-storage'),
          logDir: join(TEST_BASE_DIR, 'logs'),
          cacheDir: join(TEST_BASE_DIR, 'cache'),
        },
        file: {
          maxFileSize: 3_000_000_000,
          chunkSize: 12_000_000,
          uploadConcurrency: 4,
          trashCleanupIntervalDays: 10,
        },
        security: {
          sessionTimeout: '10d',
          sessionDurationDays: 20,
          maxSessionsPerUser: 15,
          cleanupIntervalHours: 12,
        },
        account: {
          allowNewSignup: false,
          defaultUserStorageQuota: 15_000_000_000,
        },
        integrityVerification: {
          allowCorsForVerification: false,
        },
        webauthn: {
          origin: 'https://myapp.com',
          rpId: 'myapp.com',
        },
      };

      writeFileSync(TEST_CONFIG_FILE, JSON.stringify(fileConfig, null, 2));
      process.env.CONFIG_DIR = TEST_CONFIG_DIR;
    });

    it('should load all values from config file correctly', () => {
      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.server.port).toBe(5555);
      expect(config.server.host).toBe('192.168.1.1');
      expect(config.server.nodeEnv).toBe('development');
      expect(config.server.apiPrefix).toBe('api/v3');

      expect(config.docs.enabled).toBe(true);
      expect(config.docs.path).toBe('api-docs');

      expect(config.database.host).toBe('db.local');
      expect(config.database.port).toBe(5433);
      expect(config.database.username).toBe('admin');
      expect(config.database.password).toBe('secretpass');
      expect(config.database.ssl).toBe(true);

      expect(config.file.maxFileSize).toBe(3_000_000_000);
      expect(config.file.chunkSize).toBe(12_000_000);
      expect(config.file.uploadConcurrency).toBe(4);

      expect(config.security.sessionTimeout).toBe('10d');
      expect(config.domain.domain).toBe('myapp.com');
    });

    it('should preserve undefined optional fields from config file', () => {
      const fileConfig = {
        server: {
          port: 6000,
        },
        database: {
          host: 'localhost',
          username: 'test',
          password: 'test',
        },
      };

      writeFileSync(TEST_CONFIG_FILE, JSON.stringify(fileConfig));

      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.server.port).toBe(6000);

      expect(config.server.host).toBe('0.0.0.0');
      expect(config.server.apiPrefix).toBe('api/v1');
    });
  });

  describe('Scenario 4: Priority (ENV > File > Defaults)', () => {
    it('should give environment variables highest priority over config file and defaults', () => {
      const fileConfig = {
        server: {
          port: 5000,
        },
        file: {
          maxFileSize: 500_000_000,
        },
      };

      writeFileSync(TEST_CONFIG_FILE, JSON.stringify(fileConfig));
      process.env.CONFIG_DIR = TEST_CONFIG_DIR;

      process.env.HTTP_PORT = '7000';
      process.env.MAX_FILE_SIZE = '2000000000';

      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.server.port).toBe(7000);
      expect(config.file.maxFileSize).toBe(2_000_000_000);
    });

    it('should use file values when environment variables are not set', () => {
      const fileConfig = {
        server: {
          port: 5000,
        },
        file: {
          maxFileSize: 500_000_000,
        },
        database: {
          host: 'file-db.com',
          username: 'file-user',
          password: 'file-pass',
        },
      };

      writeFileSync(TEST_CONFIG_FILE, JSON.stringify(fileConfig));
      process.env.CONFIG_DIR = TEST_CONFIG_DIR;

      delete process.env.HTTP_PORT;
      delete process.env.MAX_FILE_SIZE;
      delete process.env.DATABASE_HOST;
      delete process.env.DATABASE_USERNAME;
      delete process.env.DATABASE_PASSWORD;

      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.server.port).toBe(5000);
      expect(config.file.maxFileSize).toBe(500_000_000);
      expect(config.database.host).toBe('file-db.com');
      expect(config.database.username).toBe('file-user');
      expect(config.database.password).toBe('file-pass');
    });

    it('should use defaults when neither environment variables nor config file are set', () => {
      const fileConfig = {
        database: {
          host: 'localhost',
          username: 'test',
          password: 'test',
        },
      };
      writeFileSync(TEST_CONFIG_FILE, JSON.stringify(fileConfig));
      process.env.CONFIG_DIR = TEST_CONFIG_DIR;

      delete process.env.HTTP_PORT;
      delete process.env.MAX_FILE_SIZE;
      delete process.env.DATABASE_HOST;
      delete process.env.DATABASE_USERNAME;
      delete process.env.DATABASE_PASSWORD;

      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.server.port).toBe(3331);
      expect(config.file.maxFileSize).toBe(1_000_000_000);
      expect(config.database.host).toBe('localhost');
    });

    it('should handle partial overrides from each source', () => {
      const fileConfig = {
        server: {
          port: 5000,
          host: '192.168.1.1',
        },
        database: {
          host: 'file-host.com',
          username: 'file-user',
          password: 'file-pass',
        },
      };

      writeFileSync(TEST_CONFIG_FILE, JSON.stringify(fileConfig));
      process.env.CONFIG_DIR = TEST_CONFIG_DIR;

      process.env.HTTP_PORT = '7000';
      delete process.env.DATABASE_HOST;
      delete process.env.DATABASE_USERNAME;
      delete process.env.DATABASE_PASSWORD;

      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.server.port).toBe(7000);
      expect(config.server.host).toBe('192.168.1.1');
      expect(config.server.apiPrefix).toBe('api/v1');
    });

    it('should prioritize env vars over file for nested properties in same section', () => {
      const fileConfig = {
        database: {
          host: 'file-host.com',
          port: 5433,
          username: 'file-user',
          password: 'file-pass',
        },
      };

      writeFileSync(TEST_CONFIG_FILE, JSON.stringify(fileConfig));
      process.env.CONFIG_DIR = TEST_CONFIG_DIR;

      delete process.env.DATABASE_USERNAME;
      delete process.env.DATABASE_PASSWORD;
      process.env.DATABASE_HOST = 'env-host.com';

      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.database.host).toBe('env-host.com');
      expect(config.database.port).toBe(5433);
      expect(config.database.username).toBe('file-user');
      expect(config.database.password).toBe('file-pass');
    });
  });

  describe('Directory Resolution', () => {
    it('should resolve home directory paths with ~ prefix', () => {
      const homeDataDir = join(homedir(), 'agam-data');
      process.env.DATA_DIR = '~/agam-data';

      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.directories.dataDir).toBe(homeDataDir);
      expect(config.directories.dataDir).toContain(homedir());
    });

    it('should resolve relative paths to absolute paths', () => {
      process.env.DATA_DIR = './test-data-relative';

      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(isAbsolute(config.directories.dataDir)).toBe(true);
    });

    it('should keep absolute paths as-is', () => {
      const absolutePath = join(TEST_BASE_DIR, 'absolute-test-data');
      process.env.DATA_DIR = absolutePath;

      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.directories.dataDir).toBe(absolutePath);
    });

    it('should create directory structure if it does not exist', () => {
      const customDataDir = join(TEST_BASE_DIR, 'new-structure', 'data');
      process.env.DATA_DIR = customDataDir;

      const loader = getConfigLoader();
      loader.loadConfig();

      expect(existsSync(customDataDir)).toBe(true);
      expect(existsSync(join(customDataDir, 'files'))).toBe(true);
      expect(existsSync(join(customDataDir, 'logs'))).toBe(true);
      expect(existsSync(join(customDataDir, 'config'))).toBe(true);
      expect(existsSync(join(customDataDir, 'cache'))).toBe(true);
    });
  });

  describe('Config Service Tests', () => {
    it('should provide access to full configuration through service', () => {
      process.env.HTTP_PORT = '4000';
      process.env.DATABASE_HOST = 'testdb.com';

      const loader = getConfigLoader();
      const config = loader.loadConfig();

      expect(config.server).toBeDefined();
      expect(config.server.port).toBe(4000);
      expect(config.database).toBeDefined();
      expect(config.database.host).toBe('testdb.com');
    });

    it('should return consistent config values across multiple accesses', () => {
      process.env.HTTP_PORT = '4000';

      const loader = getConfigLoader();
      const config1 = loader.loadConfig();
      const config2 = loader.getConfig();

      expect(config1).toEqual(config2);
      expect(config1.server.port).toBe(config2.server.port);
    });

    it('should validate configuration structure correctly', () => {
      const loader = getConfigLoader();
      loader.loadConfig();

      const validConfig = {
        server: { port: 3000 },
        docs: { enabled: false },
        database: { host: 'localhost', username: 'test', password: 'test' },
        directories: { dataDir: '/tmp/data' },
        file: { maxFileSize: 1000000000 },
        security: { sessionTimeout: '7d' },
        account: { allowNewSignup: true },
        integrityVerification: { allowCorsForVerification: true },
      };

      const result = loader.validateConfig(validConfig);
      expect(result.valid).toBe(true);
    });

    it('should return validation errors for invalid configuration', () => {
      const loader = getConfigLoader();
      const invalidConfig = { server: { port: 99999 } };

      const result = loader.validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should handle partial configuration validation', () => {
      const loader = getConfigLoader();
      const partialConfig = { server: { port: 3000, host: '127.0.0.1' } };

      const result = loader.validateConfig(partialConfig);
      expect(result.valid).toBeDefined();
    });
  });
});
