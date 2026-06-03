import { Pool } from "pg"
import { resolveShardCredentials } from "./credentials"
import type { ShardConfig } from "./types"

export interface CreateShardPoolOptions {
  connectionTimeoutMillis?: number
  idleTimeoutMillis?: number
  max?: number
  min?: number
}

const ENV_DEFAULTS = {
  max: process.env.SHARD_POOL_MAX ? Number(process.env.SHARD_POOL_MAX) : 10,
  min: process.env.SHARD_POOL_MIN ? Number(process.env.SHARD_POOL_MIN) : 2,
  idleTimeoutMillis: process.env.SHARD_POOL_IDLE_TIMEOUT_MS
    ? Number(process.env.SHARD_POOL_IDLE_TIMEOUT_MS)
    : 30_000,
  connectionTimeoutMillis: process.env.SHARD_POOL_CONNECT_TIMEOUT_MS
    ? Number(process.env.SHARD_POOL_CONNECT_TIMEOUT_MS)
    : 5000,
}

function buildSslConfig(sslMode: string) {
  if (sslMode === "disable") {
    return
  }
  return { rejectUnauthorized: sslMode !== "require" }
}

export function createShardPool(
  shard: ShardConfig,
  options: CreateShardPoolOptions = {},
): Pool {
  const { password, sslMode } = resolveShardCredentials({
    credentialRef: shard.credentialRef,
    sslMode: shard.sslMode,
  })

  const merged = { ...ENV_DEFAULTS, ...options }

  return new Pool({
    host: shard.host,
    port: shard.port ?? 5432,
    database: shard.database,
    user: shard.user,
    password,
    ssl: buildSslConfig(sslMode),
    max: merged.max,
    min: merged.min,
    idleTimeoutMillis: merged.idleTimeoutMillis,
    connectionTimeoutMillis: merged.connectionTimeoutMillis,
  })
}

export function createReadShardPool(
  shard: ShardConfig,
  options: CreateShardPoolOptions = {},
): Pool | null {
  if (!shard.readHost) {
    return null
  }

  const { password, sslMode } = resolveShardCredentials({
    credentialRef: shard.credentialRef,
    sslMode: shard.sslMode,
  })

  const merged = { ...ENV_DEFAULTS, ...options }

  return new Pool({
    host: shard.readHost,
    port: shard.readPort ?? shard.port ?? 5432,
    database: shard.database,
    user: shard.user,
    password,
    ssl: buildSslConfig(sslMode),
    max: merged.max,
    min: merged.min,
    idleTimeoutMillis: merged.idleTimeoutMillis,
    connectionTimeoutMillis: merged.connectionTimeoutMillis,
  })
}
