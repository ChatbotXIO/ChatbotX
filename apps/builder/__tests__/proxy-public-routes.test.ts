import { describe, expect, test } from "vitest"
import { isPublicRoute } from "@/lib/public-routes"

describe("isPublicRoute", () => {
  test("/rpc is public so the RPC handler can answer 401 itself", () => {
    // The handler runs the full router and every procedure carries its own
    // auth middleware. Redirecting instead would return the sign-in page's
    // HTML to the typed client, which reads as a malformed response rather
    // than an expired session.
    expect(isPublicRoute("/rpc")).toBe(true)
    expect(isPublicRoute("/rpc/integrationMessengerAPIs")).toBe(true)
  })

  test("/api stays public for the token-authenticated public router", () => {
    expect(isPublicRoute("/api")).toBe(true)
    expect(isPublicRoute("/api/contacts")).toBe(true)
  })

  test("an authenticated app path is not public", () => {
    expect(isPublicRoute("/space/1/inbox")).toBe(false)
    expect(isPublicRoute("/channels/create")).toBe(false)
  })

  test("the /t/ prefix keeps its trailing slash so /templates stays private", () => {
    expect(isPublicRoute("/t/abc")).toBe(true)
    expect(isPublicRoute("/templates")).toBe(false)
  })
})
