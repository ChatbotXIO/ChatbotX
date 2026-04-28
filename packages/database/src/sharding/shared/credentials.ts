import { keys } from "../../keys"

const ENV_PREFIX = "env://"

export interface ResolvedShardCredentials {
  password: string | undefined
  sslMode: "disable" | "require" | "verify-ca" | "verify-full"
}

export interface ShardCredentialInput {
  credentialRef: string | null | undefined
  sslMode: string | null | undefined
}

export function resolveShardCredentials(
  shard: ShardCredentialInput,
): ResolvedShardCredentials {
  const env = keys()
  const password = resolvePassword(
    shard.credentialRef,
    env.MESSAGE_SHARDS_PASSWORD,
  )
  const sslMode = normalizeSslMode(shard.sslMode, env.MESSAGE_SHARDS_SSL)

  return { password, sslMode }
}

function resolvePassword(
  credentialRef: string | null | undefined,
  fallback: string | undefined,
): string | undefined {
  if (!credentialRef) {
    return fallback
  }

  if (credentialRef.startsWith(ENV_PREFIX)) {
    const varName = credentialRef.slice(ENV_PREFIX.length)
    const value = process.env[varName]
    if (!value) {
      throw new Error(
        `Shard credential env var "${varName}" is not set (referenced by credentialRef=${credentialRef})`,
      )
    }
    return value
  }

  return fallback
}

function normalizeSslMode(
  sslMode: string | null | undefined,
  legacyEnabled: boolean,
): ResolvedShardCredentials["sslMode"] {
  if (
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full"
  ) {
    return sslMode
  }
  if (sslMode === "disable") {
    return "disable"
  }

  return legacyEnabled ? "require" : "disable"
}
