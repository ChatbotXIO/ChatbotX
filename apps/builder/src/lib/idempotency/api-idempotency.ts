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

export type IdempotencyScope = {
  credentialId: string
  method: string
  procedurePath: string
  idempotencyKey: string
}

type ClaimStore = Pick<CasStore, "setIfAbsent" | "getJson" | "del">
type CompleteStore = ClaimStore & Pick<CasStore, "compareAndSwap">

export type ClaimResult =
  | { kind: "claimed"; claimId: string }
  | { kind: "replay"; output: unknown }
  | { kind: "inFlight" }
  | { kind: "fingerprintMismatch" }
  /** Store unavailable, or the claim raced an expiry — run the handler unprotected. */
  | { kind: "unprotected" }

const buildStoreKey = ({
  credentialId,
  method,
  procedurePath,
  idempotencyKey,
}: IdempotencyScope) =>
  ["api-idempotency", credentialId, method, procedurePath, idempotencyKey].join(
    ":",
  )

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
    const entries = Object.entries(value).filter(
      ([, entry]) => entry !== undefined,
    )
    return Object.fromEntries(
      entries
        .sort(([left], [right]) => {
          if (left < right) {
            return -1
          }
          if (left > right) {
            return 1
          }
          return 0
        })
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }

  return value
}

const canonicalJson = (value: unknown) =>
  JSON.stringify(canonicalize(value)) ?? "null"

export const fingerprintInput = async (input: unknown) =>
  await sha256Hex(canonicalJson(input))

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
      encodedOutput = JSON.stringify(output, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      )
    } catch (err) {
      logger.warn({ err }, "Idempotency output could not be stored")
      await releaseIdempotencyKey({ ...scope, claimId, store })
      return
    }

    if (
      encodedOutput === undefined ||
      new TextEncoder().encode(encodedOutput).byteLength >
        MAX_STORED_OUTPUT_BYTES
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
    const record = await store.getJson<IdempotencyRecord>(key)
    if (record?.claimId === claimId) {
      await store.del(key)
    }
  } catch (err) {
    logStoreUnavailable(err)
  }
}
