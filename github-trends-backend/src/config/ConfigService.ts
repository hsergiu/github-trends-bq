import dotenv from 'dotenv';
dotenv.config();

interface AppConfig {
  openai: {
    apiKey: string;
  };
  github: {
    token?: string;
  };
  postgres: {
    databaseUrl: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    database: number;
  };
  bigquery: {
    projectId?: string;
    keyFilename?: string;
    maxBytes: number;
  };
  server: {
    port: number;
    host: string;
  };
}

const CONFIG_CONSTANTS = {
  BIGQUERY_MAX_BYTES: 1024 * 1024 * 1024 * 3, // 3GB
  DEFAULT_SERVER_PORT: 3000,
  DEFAULT_REDIS_PORT: 6379,
  TEST_REDIS_DB: 1,
  PRODUCTION_REDIS_DB: 0,
  TEST_POSTGRES_DB: 'github_trends_db_test',
  PRODUCTION_POSTGRES_DB: 'github_trends_db',
} as const;

export class ConfigService {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): AppConfig {
    const requiredVars = ['OPENAI_API_KEY'];
    const missing = requiredVars.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    const isTestEnv = process.env.NODE_ENV === 'test';

    return {
      openai: {
        apiKey: process.env.OPENAI_API_KEY!,
      },
      github: {
        token: process.env.GITHUB_TOKEN,
      },
      postgres: {
        databaseUrl: isTestEnv 
          ? process.env.TEST_DATABASE_URL || `postgresql://postgres:postgres@localhost:5432/${CONFIG_CONSTANTS.TEST_POSTGRES_DB}`
          : process.env.DATABASE_URL || `postgresql://postgres:postgres@localhost:5432/${CONFIG_CONSTANTS.PRODUCTION_POSTGRES_DB}`,
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || CONFIG_CONSTANTS.DEFAULT_REDIS_PORT.toString()),
        password: process.env.REDIS_PASSWORD,
        database: parseInt(isTestEnv ? CONFIG_CONSTANTS.TEST_REDIS_DB.toString() : CONFIG_CONSTANTS.PRODUCTION_REDIS_DB.toString()),
      },
      bigquery: {
        projectId: process.env.GOOGLE_CLOUD_PROJECT,
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        maxBytes: CONFIG_CONSTANTS.BIGQUERY_MAX_BYTES,
      },
      server: {
        port: parseInt(process.env.PORT || CONFIG_CONSTANTS.DEFAULT_SERVER_PORT.toString()),
        host: process.env.HOST || 'localhost',
      },
    };
  }

  public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  public getAll(): AppConfig {
    return this.config;
  }
}

export const configService = new ConfigService();