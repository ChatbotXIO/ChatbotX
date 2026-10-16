// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const jar = vi.hoisted(() => {
  type CookieOptions = Record<string, unknown>
  const store = new Map<string, string>()
  const state: { lastSetOptions: CookieOptions | undefined } = {
    lastSetOptions: undefined,
  }
  return {
    store,
    state,
    api: {
      set: (name: string, value: string, options?: CookieOptions) => {
        store.set(name, value)
        state.lastSetOptions = options
      },
      get: (name: string) =>
        store.has(name) ? { name, value: store.get(name) } : undefined,
      delete: (target: string | { name: string }) => {
        store.delete(typeof target === "string" ? target : target.name)
      },
    },
  }
})

vi.mock("next/headers", () => ({ cookies: async () => jar.api }))

const { consumeOAuthNonce, issueOAuthNonce } = await import(
  "@/lib/oauth-state-nonce"
)

beforeEach(() => {
  jar.store.clear()
  jar.state.lastSetOptions = undefined
})

describe("issueOAuthNonce", () => {
  test("stores the nonce in a short-lived, httpOnly, same-site cookie scoped to the OAuth routes", async () => {
    const nonce = await issueOAuthNonce()

    expect([...jar.store.values()]).toEqual([nonce])
    expect(jar.state.lastSetOptions).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/integrations",
      maxAge: 600,
    })
  })

  test("issues an unguessable, different nonce every time", async () => {
    const first = await issueOAuthNonce()
    const second = await issueOAuthNonce()

    expect(first).not.toBe(second)
    expect(first.length).toBeGreaterThanOrEqual(24)
  })
})

describe("consumeOAuthNonce", () => {
  test("accepts the nonce that was issued and then forgets it", async () => {
    const nonce = await issueOAuthNonce()

    await expect(consumeOAuthNonce(nonce)).resolves.toBe(true)
    expect(jar.store.size).toBe(0)
    await expect(consumeOAuthNonce(nonce)).resolves.toBe(false)
  })

  test("rejects a nonce that differs from the cookie, and clears the cookie for the redirect that answers it", async () => {
    await issueOAuthNonce()

    await expect(consumeOAuthNonce("not-the-nonce")).resolves.toBe(false)
    expect(jar.store.size).toBe(0)
  })

  test("rejects when the browser never received the cookie", async () => {
    await expect(consumeOAuthNonce("anything")).resolves.toBe(false)
  })

  test("rejects when the callback carries no nonce", async () => {
    await issueOAuthNonce()

    await expect(consumeOAuthNonce(undefined)).resolves.toBe(false)
  })
})
