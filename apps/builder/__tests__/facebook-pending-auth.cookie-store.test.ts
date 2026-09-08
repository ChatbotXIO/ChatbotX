// @vitest-environment node

import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
// This is the class `cookies()` hands a Server Action / Route Handler:
// `next/dist/server/request/cookies.js` builds its mutable store from
// `MutableRequestCookiesAdapter.wrap(...)`, which wraps a
// `new ResponseCookies(new Headers())` taken from
// `next/dist/server/web/spec-extension/cookies` — itself a re-export of
// `next/dist/compiled/@edge-runtime/cookies`. Importing it here means these
// tests observe production serialization, not a `vi.fn()` shaped like it.
import { ResponseCookies } from "next/dist/server/web/spec-extension/cookies"
import { describe, expect, test, vi } from "vitest"
import { CONNECT_RETRY_HREF } from "@/features/channel-connect/lib/registry"
import {
  FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE,
  FB_INSTAGRAM_PENDING_AUTH_COOKIE,
  FB_MESSENGER_PENDING_AUTH_COOKIE,
  FB_PENDING_AUTH_MAX_AGE,
  writePendingAuth,
} from "@/lib/facebook-pending-auth"
import { RPC_ENDPOINT_PATH } from "@/lib/orpc/orpc"

const PENDING_AUTH_COOKIES = [
  FB_MESSENGER_PENDING_AUTH_COOKIE,
  FB_INSTAGRAM_PENDING_AUTH_COOKIE,
  FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE,
] as const

/** A fresh store over its own `Headers`, plus the raw `Set-Cookie` lines it emits. */
function responseCookieStore() {
  const headers = new Headers()
  return {
    store: new ResponseCookies(headers),
    setCookieHeaders: () => headers.getSetCookie(),
  }
}

/** The `Set-Cookie` lines whose cookie-name is `name`. */
function setCookiesFor(headers: string[], name: string) {
  return headers.filter((header) => header.startsWith(`${name}=`))
}

/** Attributes of one `Set-Cookie` line, lower-cased keys, `""` for valueless flags. */
function attributesOf(setCookie: string): Record<string, string> {
  const [, ...rest] = setCookie.split("; ")
  return Object.fromEntries(
    rest.map((part) => {
      const separator = part.indexOf("=")
      return separator === -1
        ? [part.toLowerCase(), ""]
        : [part.slice(0, separator).toLowerCase(), part.slice(separator + 1)]
    }),
  )
}

// ---------------------------------------------------------------------------
// 1. The store itself. `writePendingAuth` is exercised against Next's real
//    `ResponseCookies`, so what is asserted is the header the browser gets.
// ---------------------------------------------------------------------------

describe("writePendingAuth against Next's real ResponseCookies", () => {
  test.each(
    PENDING_AUTH_COOKIES,
  )("emits exactly one Set-Cookie for %s", (cookieName) => {
    const { store, setCookieHeaders } = responseCookieStore()

    writePendingAuth(store, cookieName, "token-1")

    expect(setCookiesFor(setCookieHeaders(), cookieName)).toHaveLength(1)
  })

  test("serializes the pending-auth cookie with the options the connect routes need", () => {
    const { store, setCookieHeaders } = responseCookieStore()

    writePendingAuth(store, FB_MESSENGER_PENDING_AUTH_COOKIE, "token-1")

    const [setCookie] = setCookiesFor(
      setCookieHeaders(),
      FB_MESSENGER_PENDING_AUTH_COOKIE,
    )
    expect(setCookie).toBeDefined()
    expect(
      setCookie.startsWith(`${FB_MESSENGER_PENDING_AUTH_COOKIE}=token-1;`),
    ).toBe(true)

    const attributes = attributesOf(setCookie as string)
    expect(attributes).toMatchObject({
      path: "/",
      "max-age": String(FB_PENDING_AUTH_MAX_AGE),
      httponly: "",
      samesite: "lax",
    })
    // Not production here, so the cookie must not claim `Secure` — a `Secure`
    // cookie is dropped outright over plain-http local dev.
    expect(attributes).not.toHaveProperty("secure")
  })

  test("marks the serialized cookie Secure in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    const { store, setCookieHeaders } = responseCookieStore()

    writePendingAuth(store, FB_MESSENGER_PENDING_AUTH_COOKIE, "token-1")

    const [setCookie] = setCookiesFor(
      setCookieHeaders(),
      FB_MESSENGER_PENDING_AUTH_COOKIE,
    )
    expect(attributesOf(setCookie as string)).toHaveProperty("secure", "")
    vi.unstubAllEnvs()
  })

  /**
   * The trap this module's doc comment names, pinned against the real class:
   * `ResponseCookies` keys its parsed map by cookie NAME, so "write the new
   * cookie, then expire the old picker-scoped one under the same name" does
   * not produce two headers — the second `set()` silently replaces the first
   * and the browser receives only the expiry. Any future edit that adds a
   * second `set()` for one name must fail here.
   */
  test("a second set() under one name replaces the first instead of adding a header", () => {
    const { store, setCookieHeaders } = responseCookieStore()

    store.set(FB_MESSENGER_PENDING_AUTH_COOKIE, "token-1", {
      path: "/",
      maxAge: FB_PENDING_AUTH_MAX_AGE,
    })
    store.set(FB_MESSENGER_PENDING_AUTH_COOKIE, "", {
      path: "/channels/messenger/select",
      maxAge: 0,
    })

    const headers = setCookiesFor(
      setCookieHeaders(),
      FB_MESSENGER_PENDING_AUTH_COOKIE,
    )
    expect(headers).toHaveLength(1)
    expect(attributesOf(headers[0] as string)).toMatchObject({
      path: "/channels/messenger/select",
      "max-age": "0",
    })
  })
})

// ---------------------------------------------------------------------------
// 2. The cookie's `Path` against every path that has to receive it.
// ---------------------------------------------------------------------------

/**
 * RFC 6265 §5.1.4, verbatim. A request-path path-matches a cookie-path if:
 *
 *   1. the cookie-path and the request-path are identical; or
 *   2. the cookie-path is a prefix of the request-path and the last character
 *      of the cookie-path is `/`; or
 *   3. the cookie-path is a prefix of the request-path and the first character
 *      of the request-path not included in the cookie-path is `/`.
 *
 * Written out rather than reduced to `startsWith` because the difference is
 * exactly the bug this file guards: `/channels/messenger/select` does NOT
 * path-match a request to the `/rpc` connect endpoint.
 */
function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) {
    return true
  }
  if (!requestPath.startsWith(cookiePath)) {
    return false
  }
  if (cookiePath.endsWith("/")) {
    return true
  }
  return requestPath.charAt(cookiePath.length) === "/"
}

/** The picker pages, read off the route tree so a new picker is covered on sight. */
function pickerRoutes(): string[] {
  const channelsDir = fileURLToPath(
    new URL("../src/app/(no-sidebar)/channels", import.meta.url),
  )
  return readdirSync(channelsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const children = readdirSync(`${channelsDir}/${entry.name}`, {
        withFileTypes: true,
      })
      return children.some(
        (child) => child.isDirectory() && child.name === "select",
      )
        ? [`/channels/${entry.name}/select`]
        : []
    })
}

/** `writePendingAuth`'s serialized `Path`, read back off a real Set-Cookie header. */
function writtenCookiePath(): string {
  const { store, setCookieHeaders } = responseCookieStore()
  writePendingAuth(store, FB_MESSENGER_PENDING_AUTH_COOKIE, "token-1")
  const [setCookie] = setCookiesFor(
    setCookieHeaders(),
    FB_MESSENGER_PENDING_AUTH_COOKIE,
  )
  return attributesOf(setCookie as string).path as string
}

describe("RFC 6265 §5.1.4 path-match", () => {
  test.each([
    ["/", "/", true],
    ["/rpc", "/", true],
    ["/channels/messenger/select", "/", true],
    ["/channels/messenger/select", "/channels/messenger/select", true],
    // The shipped bug: the connect endpoint is not under the picker's path.
    ["/rpc", "/channels/messenger/select", false],
    // Prefix without a `/` boundary is not a match.
    ["/channels/messenger/selection", "/channels/messenger/select", false],
    // Prefix with a `/` boundary is.
    ["/channels/messenger/select/x", "/channels/messenger/select", true],
    ["/channels", "/channels/messenger/select", false],
  ])("%s vs cookie-path %s -> %s", (requestPath, cookiePath, expected) => {
    expect(pathMatches(requestPath, cookiePath)).toBe(expected)
  })
})

describe("the pending-auth cookie's Path covers every path that reads it", () => {
  test("there is still a picker route to cover", () => {
    expect(pickerRoutes().length).toBeGreaterThan(0)
  })

  // Every connect now goes through the typed oRPC client, which posts to this
  // one endpoint — so it is the single request path the cookie must reach.
  test(`the connect endpoint ${RPC_ENDPOINT_PATH} receives the cookie`, () => {
    expect(pathMatches(RPC_ENDPOINT_PATH, writtenCookiePath())).toBe(true)
  })

  test.each(
    pickerRoutes(),
  )("the picker page %s receives the cookie", (route) => {
    expect(pathMatches(route, writtenCookiePath())).toBe(true)
  })

  test("the session-expired retry route receives the cookie", () => {
    expect(pathMatches(CONNECT_RETRY_HREF, writtenCookiePath())).toBe(true)
  })
})
