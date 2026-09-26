// @vitest-environment node

import type * as RedisModule from "@chatbotx.io/redis"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type * as IdempotencyModule from "@/lib/idempotency/api-idempotency"
import type { BaseContext } from "@/middlewares/context"

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  release: vi.fn(),
  fingerprint: vi.fn((_input: unknown) => "fingerprint"),
  isValidKey: vi.fn((_value: string) => true),
  setIfAbsent: vi.fn(),
  getJson: vi.fn(),
  compareAndDelete: vi.fn(),
  compareAndSwap: vi.fn(),
  useActualStore: false,
}))

vi.mock("@chatbotx.io/redis", async (importOriginal) => {
  const actual = await importOriginal<typeof RedisModule>()

  return {
    ...actual,
    casStore: {
      setIfAbsent: (...args: unknown[]) => mocks.setIfAbsent(...args),
      getJson: (...args: unknown[]) => mocks.getJson(...args),
      compareAndDelete: (...args: unknown[]) => mocks.compareAndDelete(...args),
      compareAndSwap: (...args: unknown[]) => mocks.compareAndSwap(...args),
    },
  }
})

vi.mock("@/lib/idempotency/api-idempotency", async (importOriginal) => {
  const actual = await importOriginal<typeof IdempotencyModule>()
  return {
    ...actual,
    claimIdempotencyKey: (
      ...args: Parameters<(typeof IdempotencyModule)["claimIdempotencyKey"]>
    ) =>
      mocks.useActualStore
        ? actual.claimIdempotencyKey(...args)
        : mocks.claim(...args),
    completeIdempotencyKey: (
      ...args: Parameters<(typeof IdempotencyModule)["completeIdempotencyKey"]>
    ) =>
      mocks.useActualStore
        ? actual.completeIdempotencyKey(...args)
        : mocks.complete(...args),
    fingerprintInput: (
      ...args: Parameters<(typeof IdempotencyModule)["fingerprintInput"]>
    ) =>
      mocks.useActualStore
        ? actual.fingerprintInput(...args)
        : mocks.fingerprint(...args),
    isValidIdempotencyKey: (
      ...args: Parameters<(typeof IdempotencyModule)["isValidIdempotencyKey"]>
    ) =>
      mocks.useActualStore
        ? actual.isValidIdempotencyKey(...args)
        : mocks.isValidKey(...args),
    releaseIdempotencyKey: (
      ...args: Parameters<(typeof IdempotencyModule)["releaseIdempotencyKey"]>
    ) =>
      mocks.useActualStore
        ? actual.releaseIdempotencyKey(...args)
        : mocks.release(...args),
  }
})

const { apiIdempotencyMiddleware } = await import("@/middlewares/idempotency")

type Middleware = (
  options: {
    context: {
      apiCredentialId?: string
      headers: Headers
      resHeaders?: Headers
    }
    next: () => Promise<{ output: unknown }>
    path: readonly string[]
    procedure: { "~orpc": { route: { method?: string } } }
  },
  input: unknown,
  output: (value: unknown) => unknown,
) => Promise<unknown>

const middleware = apiIdempotencyMiddleware as unknown as Middleware

describe("apiIdempotencyMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.claim.mockResolvedValue({ kind: "claimed", claimId: "claim-1" })
    mocks.complete.mockResolvedValue(undefined)
    mocks.release.mockResolvedValue(undefined)
  })

  test("skips requests without a key", async () => {
    const next = vi.fn().mockResolvedValue({ output: { id: "tag-1" } })

    await expect(
      middleware(
        {
          context: { headers: new Headers(), apiCredentialId: "api-token:1" },
          next,
          path: ["tags", "create"],
          procedure: { "~orpc": { route: { method: "POST" } } },
        },
        { name: "tag" },
        vi.fn(),
      ),
    ).resolves.toEqual({ output: { id: "tag-1" } })

    expect(next).toHaveBeenCalledOnce()
    expect(mocks.claim).not.toHaveBeenCalled()
  })

  test("skips GET requests with a key", async () => {
    const next = vi.fn().mockResolvedValue({ output: { id: "tag-1" } })

    await middleware(
      {
        context: {
          headers: new Headers({ "Idempotency-Key": "key-1" }),
          apiCredentialId: "api-token:1",
        },
        next,
        path: ["tags", "list"],
        procedure: { "~orpc": { route: { method: "GET" } } },
      },
      {},
      vi.fn(),
    )

    expect(next).toHaveBeenCalledOnce()
    expect(mocks.claim).not.toHaveBeenCalled()
  })

  test("returns a replay without calling the handler", async () => {
    const resHeaders = new Headers()
    const next = vi.fn()
    const output = vi.fn((value: unknown) => ({ output: value }))
    mocks.claim.mockResolvedValue({
      kind: "replay",
      output: { id: "tag-1" },
    })

    await expect(
      middleware(
        {
          context: {
            headers: new Headers({ "Idempotency-Key": "key-1" }),
            resHeaders,
            apiCredentialId: "api-token:1",
          },
          next,
          path: ["tags", "create"],
          procedure: { "~orpc": { route: { method: "POST" } } },
        },
        { name: "tag" },
        output,
      ),
    ).resolves.toEqual({ output: { id: "tag-1" } })

    expect(next).not.toHaveBeenCalled()
    expect(resHeaders.get("Idempotent-Replayed")).toBe("true")
  })

  test("rejects a key reused with a different request", async () => {
    const next = vi.fn()
    mocks.claim.mockResolvedValue({ kind: "fingerprintMismatch" })

    await expect(
      middleware(
        {
          context: {
            headers: new Headers({ "Idempotency-Key": "key-1" }),
            apiCredentialId: "api-token:1",
          },
          next,
          path: ["tags", "create"],
          procedure: { "~orpc": { route: { method: "POST" } } },
        },
        { name: "tag" },
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: "idempotencyKeyReused", status: 422 })

    expect(next).not.toHaveBeenCalled()
  })

  test("rejects an in-flight key", async () => {
    const next = vi.fn()
    mocks.claim.mockResolvedValue({ kind: "inFlight" })

    await expect(
      middleware(
        {
          context: {
            headers: new Headers({ "Idempotency-Key": "key-1" }),
            apiCredentialId: "api-token:1",
          },
          next,
          path: ["tags", "create"],
          procedure: { "~orpc": { route: { method: "POST" } } },
        },
        { name: "tag" },
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: "idempotencyKeyConflict", status: 409 })

    expect(next).not.toHaveBeenCalled()
  })

  test("passes through when the idempotency store is unavailable", async () => {
    const result = { output: { id: "tag-1" } }
    const next = vi.fn().mockResolvedValue(result)
    mocks.claim.mockResolvedValue({ kind: "unprotected" })

    await expect(
      middleware(
        {
          context: {
            headers: new Headers({ "Idempotency-Key": "key-1" }),
            apiCredentialId: "api-token:1",
          },
          next,
          path: ["tags", "create"],
          procedure: { "~orpc": { route: { method: "POST" } } },
        },
        { name: "tag" },
        vi.fn(),
      ),
    ).resolves.toEqual(result)

    expect(next).toHaveBeenCalledOnce()
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  test("completes a claimed key with the handler output", async () => {
    const handlerOutput = { id: "tag-1" }
    const result = { output: handlerOutput }
    const next = vi.fn().mockResolvedValue(result)
    const resHeaders = new Headers()

    await expect(
      middleware(
        {
          context: {
            headers: new Headers({ "Idempotency-Key": "key-1" }),
            resHeaders,
            apiCredentialId: "api-token:1",
          },
          next,
          path: ["tags", "create"],
          procedure: { "~orpc": { route: { method: "POST" } } },
        },
        { name: "tag" },
        vi.fn(),
      ),
    ).resolves.toEqual(result)

    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ claimId: "claim-1", output: handlerOutput }),
    )
    expect(resHeaders.get("Idempotent-Replayed")).toBeNull()
  })

  test("releases a claimed key when the handler throws", async () => {
    const failure = new Error("failed")
    const next = vi.fn().mockRejectedValue(failure)

    await expect(
      middleware(
        {
          context: {
            headers: new Headers({ "Idempotency-Key": "key-1" }),
            apiCredentialId: "api-token:1",
          },
          next,
          path: ["tags", "create"],
          procedure: { "~orpc": { route: { method: "POST" } } },
        },
        { name: "tag" },
        vi.fn(),
      ),
    ).rejects.toThrow(failure)

    expect(mocks.release).toHaveBeenCalledWith(
      expect.objectContaining({ claimId: "claim-1" }),
    )
  })

  test("rejects an invalid idempotency key", async () => {
    mocks.isValidKey.mockReturnValue(false)

    await expect(
      middleware(
        {
          context: {
            headers: new Headers({ "Idempotency-Key": " " }),
            apiCredentialId: "api-token:1",
          },
          next: vi.fn(),
          path: ["tags", "create"],
          procedure: { "~orpc": { route: { method: "POST" } } },
        },
        {},
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: "idempotencyKeyInvalid", status: 422 })
  })
})

describe("apiIdempotencyMiddleware HTTP wiring", () => {
  test("replays an HTTP response without re-running the handler", async () => {
    const records = new Map<string, Record<string, unknown>>()
    const store = {
      setIfAbsent<T>(key: string, value: T): Promise<boolean> {
        if (records.has(key)) {
          return Promise.resolve(false)
        }
        records.set(key, value as Record<string, unknown>)
        return Promise.resolve(true)
      },
      getJson<T>(key: string): Promise<T | null> {
        return Promise.resolve((records.get(key) as T | undefined) ?? null)
      },
      compareAndDelete<T extends Record<string, unknown>>(
        key: string,
        expected: Partial<T>,
      ): Promise<boolean> {
        const current = records.get(key)
        if (
          !current ||
          Object.entries(expected).some(
            ([field, value]) => current[field] !== value,
          )
        ) {
          return Promise.resolve(false)
        }
        records.delete(key)
        return Promise.resolve(true)
      },
      compareAndSwap<T extends Record<string, unknown>>(
        key: string,
        expected: Partial<T> | null,
        next: T,
      ): Promise<boolean> {
        const current = records.get(key)
        if (
          !(current && expected) ||
          Object.entries(expected).some(
            ([field, value]) => current[field] !== value,
          )
        ) {
          return Promise.resolve(false)
        }
        records.set(key, next)
        return Promise.resolve(true)
      },
    }

    mocks.useActualStore = true
    mocks.setIfAbsent.mockImplementation(store.setIfAbsent)
    mocks.getJson.mockImplementation(store.getJson)
    mocks.compareAndDelete.mockImplementation(store.compareAndDelete)
    mocks.compareAndSwap.mockImplementation(store.compareAndSwap)

    const [{ os }, { createOpenAPIHandler }, { z }] = await Promise.all([
      import("@orpc/server"),
      import("@/lib/orpc/handlers"),
      import("zod"),
    ])
    const handler = vi.fn(() => ({
      at: new Date("2026-09-25T10:00:00.000Z"),
    }))
    const openApiHandler = createOpenAPIHandler(
      {
        replay: os
          .$context<BaseContext & { apiCredentialId: string }>()
          .use(apiIdempotencyMiddleware)
          .route({ method: "POST", path: "/idempotency-replay" })
          .output(z.object({ at: z.date() }))
          .handler(handler),
      },
      { title: "Idempotency test", logLabel: "idempotency-test" },
    )
    const createRequest = () =>
      new Request("http://localhost/idempotency-replay", {
        method: "POST",
        headers: { "Idempotency-Key": "key-1" },
      })
    const firstRequest = createRequest()
    const first = await openApiHandler.handle(firstRequest, {
      context: {
        apiCredentialId: "api-token:1",
        headers: firstRequest.headers,
      },
    })
    const secondRequest = createRequest()
    const second = await openApiHandler.handle(secondRequest, {
      context: {
        apiCredentialId: "api-token:1",
        headers: secondRequest.headers,
      },
    })

    if (!(first.matched && second.matched)) {
      throw new Error("Expected idempotency route to match")
    }

    expect(handler).toHaveBeenCalledOnce()
    expect(second.response.headers.get("Idempotent-Replayed")).toBe("true")
    await expect(second.response.json()).resolves.toEqual(
      await first.response.json(),
    )
  })
})
