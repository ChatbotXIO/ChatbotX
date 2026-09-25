// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  release: vi.fn(),
  fingerprint: vi.fn(() => "fingerprint"),
  isValidKey: vi.fn(() => true),
}))

vi.mock("@/lib/idempotency/api-idempotency", () => ({
  claimIdempotencyKey: mocks.claim,
  completeIdempotencyKey: mocks.complete,
  fingerprintInput: mocks.fingerprint,
  isValidIdempotencyKey: mocks.isValidKey,
  releaseIdempotencyKey: mocks.release,
}))

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
