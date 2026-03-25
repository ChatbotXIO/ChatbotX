import { Redis, type RedisOptions } from "ioredis"

export async function createRedisConnection(
  url: string,
  options: Partial<RedisOptions> = {},
): Promise<Redis> {
  const config: Partial<RedisOptions> = {
    maxRetriesPerRequest: null,
    keepAlive: 5000,
    ...options,
  }

  return await new Redis(url, config)
}
