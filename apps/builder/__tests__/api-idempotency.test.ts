// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn() },
}))

import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  fingerprintInput,
  releaseIdempotencyKey,
} from "../src/lib/idempotency/api-idempotency"

type RecordValue = Record<string, unknown>

const scope = {
  credentialId: "api-token:token-1",
  method: "POST",
  procedurePath: "tags.create",
  idempotencyKey: "key-1",
}

const createStore = () => {
  const records = new Map<string, RecordValue>()

  return {
    records,
    store: {
      setIfAbsent<T>(key: string, value: T): Promise<boolean> {
        if (records.has(key)) {
          return Promise.resolve(false)
        }
        records.set(key, value as RecordValue)
        return Promise.resolve(true)
      },
      getJson<T>(key: string): Promise<T | null> {
        return Promise.resolve((records.get(key) as T | undefined) ?? null)
      },
      del(key: string): Promise<void> {
        records.delete(key)
        return Promise.resolve()
      },
      compareAndSwap<T extends Record<string, unknown>>(
        key: string,
        expected: Partial<T> | null,
        next: T,
      ): Promise<boolean> {
        const current = records.get(key)
        if (!(current && expected)) {
          return Promise.resolve(false)
        }
        if (
          Object.entries(expected).some(
            ([field, value]) => current[field] !== value,
          )
        ) {
          return Promise.resolve(false)
        }
        records.set(key, next)
        return Promise.resolve(true)
      },
    },
  }
}

describe("API idempotency store", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("claims once, rejects concurrent callers, and replays a completed output", async () => {
    const { store } = createStore()
    const fingerprint = await fingerprintInput({ name: "tag" })

    const first = await claimIdempotencyKey({ ...scope, fingerprint, store })
    expect(first.kind).toBe("claimed")
    if (first.kind !== "claimed") {
      return
    }

    await expect(
      claimIdempotencyKey({ ...scope, fingerprint, store }),
    ).resolves.toEqual({ kind: "inFlight" })

    await completeIdempotencyKey({
      ...scope,
      fingerprint,
      claimId: first.claimId,
      output: { id: "tag-1" },
      store,
    })

    await expect(
      claimIdempotencyKey({ ...scope, fingerprint, store }),
    ).resolves.toEqual({
      kind: "replay",
      output: { id: "tag-1" },
    })
  })

  test("rejects a key reused with a different payload", async () => {
    const { store } = createStore()
    const first = await claimIdempotencyKey({
      ...scope,
      fingerprint: await fingerprintInput({ name: "first" }),
      store,
    })
    expect(first.kind).toBe("claimed")

    await expect(
      claimIdempotencyKey({
        ...scope,
        fingerprint: await fingerprintInput({ name: "second" }),
        store,
      }),
    ).resolves.toEqual({ kind: "fingerprintMismatch" })
  })

  test("releases only its own claim", async () => {
    const { store } = createStore()
    const first = await claimIdempotencyKey({
      ...scope,
      fingerprint: await fingerprintInput({ name: "tag" }),
      store,
    })
    expect(first.kind).toBe("claimed")
    if (first.kind !== "claimed") {
      return
    }

    await releaseIdempotencyKey({ ...scope, claimId: "stale", store })
    await expect(
      claimIdempotencyKey({
        ...scope,
        fingerprint: await fingerprintInput({ name: "tag" }),
        store,
      }),
    ).resolves.toEqual({ kind: "inFlight" })

    await releaseIdempotencyKey({ ...scope, claimId: first.claimId, store })
    await expect(
      claimIdempotencyKey({
        ...scope,
        fingerprint: await fingerprintInput({ name: "tag" }),
        store,
      }),
    ).resolves.toMatchObject({ kind: "claimed" })
  })

  test("fails open when the store is unavailable", async () => {
    const unavailableStore = {
      setIfAbsent: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
      getJson: vi.fn(),
      del: vi.fn(),
    }

    await expect(
      claimIdempotencyKey({
        ...scope,
        fingerprint: await fingerprintInput({ name: "tag" }),
        store: unavailableStore,
      }),
    ).resolves.toEqual({ kind: "unprotected" })
  })

  test("releases an oversized completed output", async () => {
    const { store } = createStore()
    const fingerprint = await fingerprintInput({ name: "tag" })
    const first = await claimIdempotencyKey({ ...scope, fingerprint, store })
    expect(first.kind).toBe("claimed")
    if (first.kind !== "claimed") {
      return
    }

    await completeIdempotencyKey({
      ...scope,
      fingerprint,
      claimId: first.claimId,
      output: { value: "x".repeat(256 * 1024) },
      store,
    })

    await expect(
      claimIdempotencyKey({ ...scope, fingerprint, store }),
    ).resolves.toMatchObject({ kind: "claimed" })
  })

  test("isolates keys by procedure path", async () => {
    const { store } = createStore()
    const fingerprint = await fingerprintInput({ name: "tag" })

    await expect(
      claimIdempotencyKey({ ...scope, fingerprint, store }),
    ).resolves.toMatchObject({ kind: "claimed" })
    await expect(
      claimIdempotencyKey({
        ...scope,
        procedurePath: "contacts.create",
        fingerprint,
        store,
      }),
    ).resolves.toMatchObject({ kind: "claimed" })
  })

  test("different Date inputs produce different fingerprints", async () => {
    const first = await fingerprintInput({
      startAt: new Date("2026-09-25T10:00:00.000Z"),
    })
    const second = await fingerprintInput({
      startAt: new Date("2026-09-25T11:00:00.000Z"),
    })

    expect(second).not.toBe(first)
  })

  test("key order does not change the fingerprint", async () => {
    const first = await fingerprintInput({
      name: "tag",
      nested: { color: "red", size: "large" },
    })
    const second = await fingerprintInput({
      nested: { size: "large", color: "red" },
      name: "tag",
    })

    expect(second).toBe(first)
  })
})
