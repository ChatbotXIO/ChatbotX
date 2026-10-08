import { type CasStore, casStore } from "@chatbotx.io/redis"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { logger } from "@/lib/log"
import {
  IDEMPOTENCY_RETENTION_HOURS,
  MAX_IDEMPOTENCY_KEY_LENGTH,
} from "./constants"

// A crashed process must not wedge a key at 409 for a day; an in-flight claim
// expires quickly so a retry re-executes, while a completed record gets 24h.
const IN_FLIGHT_TTL_MS = 5 * 60 * 1000
const COMPLETED_TTL_MS = IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000
// Guards Redis memory; a larger response is not stored (key released instead).
const MAX_STORED_OUTPUT_BYTES = 256 * 1024

type IdempotencyRecord = {
  state: "inFlight" | "completed"
  claimId: string
  fingerprint: string
  /** JSON-encoded handler output. Absent when the route returns no body. */
  output?: string
}

type IdempotencyScope = {
  credentialId: string
  procedurePath: string
  idempotencyKey: string
}

type ClaimStore = Pick<CasStore, "setIfAbsent" | "getJson" | "compareAndDelete">
type CompleteStore = ClaimStore & Pick<CasStore, "compareAndSwap">

type ClaimResult =
  | { kind: "claimed"; claimId: string }
  | { kind: "replay"; output: unknown }
  | { kind: "inFlight" }
  | { kind: "fingerprintMismatch" }
  /** Store unavailable, or the claim raced an expiry — run the handler unprotected. */
  | { kind: "unprotected" }

const buildStoreKey = ({
  credentialId,
  procedurePath,
  idempotencyKey,
}: IdempotencyScope) =>
  ["api-idempotency", credentialId, procedurePath, idempotencyKey].join(":")

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? String(value) : value.toISOString()
  }

  if (typeof value === "bigint") {
    return value.toString()
  }

  if (value instanceof Blob) {
    const name =
      typeof File !== "undefined" && value instanceof File ? value.name : ""
    return `__blob__:${name}:${value.size}:${value.type}`
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }

  return value
}

const canonicalJson = (value: unknown) =>
  JSON.stringify(canonicalize(value)) ?? "null"

export const fingerprintInput = (input: unknown) =>
  sha256Hex(canonicalJson(input))

export const isValidIdempotencyKey = (value: string) =>
  value.length >= 1 && value.length <= MAX_IDEMPOTENCY_KEY_LENGTH

const logStoreUnavailable = (err: unknown) => {
  logger.warn({ err }, "Idempotency store unavailable, proceeding unprotected")
}

export const claimIdempotencyKey = async ({
  fingerprint,
  store = casStore,
  ...scope
}: IdempotencyScope & {
  fingerprint: string
  store?: ClaimStore
}): Promise<ClaimResult> => {
  const key = buildStoreKey(scope)
  const claimId = crypto.randomUUID()
  const record: IdempotencyRecord = {
    state: "inFlight",
    claimId,
    fingerprint,
  }

  try {
    if (await store.setIfAbsent(key, record, IN_FLIGHT_TTL_MS)) {
      return { kind: "claimed", claimId }
    }

    const existing = await store.getJson<IdempotencyRecord>(key)
    if (!existing) {
      return { kind: "unprotected" }
    }
    if (existing.fingerprint !== fingerprint) {
      return { kind: "fingerprintMismatch" }
    }
    if (existing.state === "inFlight") {
      return { kind: "inFlight" }
    }

    return {
      kind: "replay",
      output: existing.output ? JSON.parse(existing.output) : undefined,
    }
  } catch (err) {
    logStoreUnavailable(err)
    return { kind: "unprotected" }
  }
}

/**
 * A one-time credential (`connections.create` → `secret.token` for the API
 * channel) is promised to be "never retrievable again", so it must not sit in
 * Redis for 24h nor come back on a replay. The replay still returns the same
 * `connection`, so a retry cannot create a duplicate channel.
 */
export const redactOneTimeSecret = (output: unknown): unknown =>
  output !== null &&
  typeof output === "object" &&
  "secret" in output &&
  output.secret != null
    ? { ...output, secret: null }
    : output

export const completeIdempotencyKey = async ({
  claimId,
  fingerprint,
  output,
  store = casStore,
  ...scope
}: IdempotencyScope & {
  fingerprint: string
  claimId: string
  output: unknown
  store?: CompleteStore
}): Promise<void> => {
  const key = buildStoreKey(scope)
  let encodedOutput: string | undefined

  if (output !== undefined) {
    try {
      encodedOutput = JSON.stringify(
        redactOneTimeSecret(output),
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      )
    } catch (err) {
      logger.warn({ err }, "Idempotency output could not be stored")
      await releaseIdempotencyKey({ ...scope, claimId, store })
      return
    }

    if (
      encodedOutput === undefined ||
      Buffer.byteLength(encodedOutput) > MAX_STORED_OUTPUT_BYTES
    ) {
      logger.warn("Idempotency output exceeded storage limit")
      await releaseIdempotencyKey({ ...scope, claimId, store })
      return
    }
  }

  const record: IdempotencyRecord = {
    state: "completed",
    claimId,
    fingerprint,
    ...(encodedOutput === undefined ? {} : { output: encodedOutput }),
  }

  try {
    const completed = await store.compareAndSwap(
      key,
      { state: "inFlight", claimId },
      record,
      COMPLETED_TTL_MS,
    )
    if (!completed) {
      logger.warn("Idempotency claim expired before completion")
    }
  } catch (err) {
    logStoreUnavailable(err)
  }
}

export const releaseIdempotencyKey = async ({
  claimId,
  store = casStore,
  ...scope
}: IdempotencyScope & {
  claimId: string
  store?: ClaimStore
}): Promise<void> => {
  const key = buildStoreKey(scope)

  try {
    await store.compareAndDelete(key, { state: "inFlight", claimId })
  } catch (err) {
    logStoreUnavailable(err)
  }
}
