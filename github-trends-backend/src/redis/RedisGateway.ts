import { createClient, RedisClientType } from "redis";
import { configService } from "../config/ConfigService";

export class RedisGateway {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor(
    private readonly host: string = configService.get("redis").host,
    private readonly port: number = configService.get("redis").port,
    private readonly database: number = configService.get("redis").database,
  ) {
    this.client = createClient({
      url: `redis://${this.host}:${this.port}`,
      database: this.database,
    });

    this.client.on("error", (err) => console.error("Redis Client Error", err));
    this.client.on("connect", () => {
      console.log("Connected to Redis server");
      this.isConnected = true;
    });
    this.client.on("disconnect", () => {
      console.log("Disconnected from Redis server");
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
    }
  }

  pipeline() {
    return this.client.multi();
  }

  getClient(): RedisClientType {
    return this.client;
  }

  isClientConnected(): boolean {
    return this.isConnected;
  }

  async set(
    key: string,
    value: string,
    expiryInSeconds?: number,
  ): Promise<void> {
    if (expiryInSeconds) {
      await this.client.set(key, value, { EX: expiryInSeconds });
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async delete(key: string): Promise<number> {
    return await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async mset(data: Record<string, string>): Promise<void> {
    await this.client.mSet(data);
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    return await this.client.mGet(keys);
  }

  async executePipeline(pipeline: any): Promise<any[]> {
    return await pipeline.exec();
  }

  async batchSetWithTTL(
    data: Array<{ key: string; value: string; ttl: number }>,
  ): Promise<void> {
    const pipeline = this.client.multi();

    for (const item of data) {
      pipeline.set(item.key, item.value, { EX: item.ttl });
    }

    await pipeline.exec();
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }
}
