// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// `readPendingAuth` is the ONLY source of the Messenger/Instagram connect
// actions' user token and `workspaceId` (plan §4.7) — never client input.
// It must return null for anything that isn't a genuinely fresh, unmodified,
// schema-shaped payload: a missing cookie, an expired one, a tampered
// ciphertext, or a decrypted-but-malformed JSON object (a future field
// rename/drop, or an outright forged cookie). This exercises the real
// `@chatbotx.io/encryption` primitives (ENCRYPTION_KEY is seeded by the
// vitest-config node preset's `setup-env.ts`) rather than mocking them, so
// the tamper-detection case is a genuine AES-GCM auth-tag failure.
// ---------------------------------------------------------------------------

const mockCookies = vi.hoisted(() => vi.fn())

vi.mock("next/headers", () => ({ cookies: mockCookies }))

const {
  encryptAuth,
  FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE,
  FB_INSTAGRAM_PENDING_AUTH_COOKIE,
  FB_MESSENGER_PENDING_AUTH_COOKIE,
  FB_PENDING_AUTH_MAX_AGE,
  readPendingAuth,
  writePendingAuth,
} = await import("@/lib/facebook-pending-auth")

function stubCookie(value: string | undefined) {
  mockCookies.mockResolvedValue({
    get: (name: string) =>
      name === FB_MESSENGER_PENDING_AUTH_COOKIE && value !== undefined
        ? { value }
        : undefined,
  })
}

const basePayload = {
  userToken: "user-token-1",
  workspaceId: "ws-1",
  referer: "/channels/create",
  version: "v23.0",
  expiresAt: Date.now() + 600_000,
}

describe("readPendingAuth", () => {
  beforeEach(() => {
    mockCookies.mockReset()
  })

  test("returns null when the cookie is missing", async () => {
    stubCookie(undefined)

    expect(await readPendingAuth(FB_MESSENGER_PENDING_AUTH_COOKIE)).toBeNull()
  })

  test("returns the decrypted payload for a valid, unexpired, schema-shaped cookie", async () => {
    const token = await encryptAuth(basePayload)
    stubCookie(token)

    expect(await readPendingAuth(FB_MESSENGER_PENDING_AUTH_COOKIE)).toEqual(
      basePayload,
    )
  })

  test("returns null once the payload's expiresAt has passed", async () => {
    const token = await encryptAuth({
      ...basePayload,
      expiresAt: Date.now() - 1000,
    })
    stubCookie(token)

    expect(await readPendingAuth(FB_MESSENGER_PENDING_AUTH_COOKIE)).toBeNull()
  })

  test("returns null when the ciphertext has been tampered with", async () => {
    const token = await encryptAuth(basePayload)
    // Flip the envelope's base64url tail — the AES-GCM auth tag no longer
    // matches, so decryption itself fails.
    const tampered = token.endsWith("A")
      ? `${token.slice(0, -1)}B`
      : `${token.slice(0, -1)}A`
    stubCookie(tampered)

    expect(await readPendingAuth(FB_MESSENGER_PENDING_AUTH_COOKIE)).toBeNull()
  })

  test("returns null for a garbage (non-envelope) cookie value", async () => {
    stubCookie("not-a-valid-base64url-envelope")

    expect(await readPendingAuth(FB_MESSENGER_PENDING_AUTH_COOKIE)).toBeNull()
  })

  test("returns null when a required field is missing from the decrypted payload", async () => {
    const { workspaceId: _dropped, ...invalidPayload } = basePayload
    const token = await encryptAuth(invalidPayload)
    stubCookie(token)

    expect(await readPendingAuth(FB_MESSENGER_PENDING_AUTH_COOKIE)).toBeNull()
  })

  test("returns null when a required field has the wrong type", async () => {
    const token = await encryptAuth({ ...basePayload, expiresAt: "soon" })
    stubCookie(token)

    expect(await readPendingAuth(FB_MESSENGER_PENDING_AUTH_COOKIE)).toBeNull()
  })

  test("returns null when userToken is present but empty", async () => {
    const token = await encryptAuth({ ...basePayload, userToken: "" })
    stubCookie(token)

    expect(await readPendingAuth(FB_MESSENGER_PENDING_AUTH_COOKIE)).toBeNull()
  })

  test("accepts the optional user-identity fields when present", async () => {
    const withOptionalFields = {
      ...basePayload,
      userId: "fb-user-1",
      userName: "FB User",
      userAvatarUrl: "https://example.com/avatar.jpg",
    }
    const token = await encryptAuth(withOptionalFields)
    stubCookie(token)

    expect(await readPendingAuth(FB_MESSENGER_PENDING_AUTH_COOKIE)).toEqual(
      withOptionalFields,
    )
  })
})

/**
 * The connect procedures read this cookie server-side, so its `path` has to
 * cover the endpoint the typed oRPC client posts them to. It used to be
 * scoped to the picker page the server action was called from — with the
 * picker now posting to `/rpc`, that scoping meant the browser simply never
 * sent it and every batch died on `sessionExpired`. Asserted through the
 * writer, which is the only thing that reaches a real cookie store.
 */
describe("the pending-auth cookie's own options", () => {
  const write = (cookieName = FB_MESSENGER_PENDING_AUTH_COOKIE) => {
    const set = vi.fn()
    writePendingAuth({ set }, cookieName, "token-1")
    return set.mock.calls[0]?.[2] as Record<string, unknown>
  }

  test("scopes the cookie to the whole app, so the connect routes receive it", () => {
    expect(write().path).toBe("/")
  })

  test("keeps every other protection the picker-scoped cookie had", () => {
    expect(write()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      maxAge: FB_PENDING_AUTH_MAX_AGE,
    })
  })

  test("marks the cookie secure in production only", () => {
    const original = process.env.NODE_ENV

    vi.stubEnv("NODE_ENV", "production")
    expect(write().secure).toBe(true)

    vi.stubEnv("NODE_ENV", "development")
    expect(write().secure).toBe(false)

    vi.stubEnv("NODE_ENV", original ?? "test")
  })
})

/**
 * A browser that started a connect just before the path widened still holds a
 * picker-scoped cookie under the same name, and a path-scoped cookie wins over
 * a root-scoped one on the picker page. Every write therefore expires the old
 * one — otherwise the picker could keep reading a stale session for up to ten
 * minutes after the deploy.
 */
describe("writePendingAuth", () => {
  const setCalls = () => {
    const set = vi.fn()
    return { store: { set }, set }
  }

  test("writes the new cookie at the root path", () => {
    const { store, set } = setCalls()

    writePendingAuth(store, FB_MESSENGER_PENDING_AUTH_COOKIE, "token-1")

    expect(set).toHaveBeenNthCalledWith(
      1,
      FB_MESSENGER_PENDING_AUTH_COOKIE,
      "token-1",
      expect.objectContaining({ path: "/", httpOnly: true, maxAge: 600 }),
    )
  })

  test.each([
    FB_MESSENGER_PENDING_AUTH_COOKIE,
    FB_INSTAGRAM_PENDING_AUTH_COOKIE,
    FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE,
  ])("issues exactly one Set-Cookie for %s — a second set() under the same name would replace it in Next's name-keyed store", (cookieName) => {
    const { store, set } = setCalls()

    writePendingAuth(store, cookieName, "token-1")

    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(
      cookieName,
      "token-1",
      expect.objectContaining({ path: "/", maxAge: 600 }),
    )
  })
})
