import { Pool } from "pg"
import { resolveShardCredentials } from "./credentials"
import type { ShardConfig } from "./types"

export interface CreateShardPoolOptions {
  connectionTimeoutMillis?: number
  idleTimeoutMillis?: number
  max?: number
}

const DEFAULTS: Required<CreateShardPoolOptions> = {
  max: 100,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5000,
}

export function createShardPool(
  shard: ShardConfig,
  options: CreateShardPoolOptions = {},
): Pool {
  const { password, sslMode } = resolveShardCredentials({
    credentialRef: shard.credentialRef,
    sslMode: shard.sslMode,
  })

  const merged = { ...DEFAULTS, ...options }

  return new Pool({
    host: shard.host,
    port: shard.port ?? 5432,
    database: shard.database,
    user: shard.user,
    password,
    ssl:
      sslMode === "disable"
        ? undefined
        : { rejectUnauthorized: sslMode !== "require" },
    max: merged.max,
    idleTimeoutMillis: merged.idleTimeoutMillis,
    connectionTimeoutMillis: merged.connectionTimeoutMillis,
  })
}
