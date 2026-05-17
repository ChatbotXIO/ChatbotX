import { beforeEach, describe, expect, test } from "vitest"
import { HttpResponse, http, server } from "../src/msw.ts"

/**
 * Lifecycle tests for the shared MSW server. Stays integration-free on
 * purpose — `vitest-config` cannot depend on any `integrations/*` package
 * without becoming circular, since every integration depends on
 * `vitest-config` as a devDep.
 *
 * Note: `setup-msw.ts` calls `server.resetHandlers()` after every test, which
 * wipes everything registered via `server.use(...)`. To keep a baseline
 * handler available across tests in a suite, register it in `beforeEach`
 * (not `beforeAll`).
 */
describe("MSW lifecycle", () => {
  const SENTINEL_URL = "https://msw.vitest-config.test/echo"

  beforeEach(() => {
    server.use(
      http.post(SENTINEL_URL, () => HttpResponse.json({ source: "default" })),
    )
  })

  test("handler registered in beforeEach intercepts the request", async () => {
    const response = await fetch(SENTINEL_URL, { method: "POST" })

    expect(response.ok).toBe(true)
    const body = (await response.json()) as { source: string }
    expect(body.source).toBe("default")
  })

  test("server.use overrides the baseline for a single test", async () => {
    server.use(
      http.post(SENTINEL_URL, () =>
        HttpResponse.json({ source: "override" }, { status: 418 }),
      ),
    )

    const response = await fetch(SENTINEL_URL, { method: "POST" })

    expect(response.status).toBe(418)
    const body = (await response.json()) as { source: string }
    expect(body.source).toBe("override")
  })

  test("baseline restored on the next test after resetHandlers", async () => {
    const response = await fetch(SENTINEL_URL, { method: "POST" })

    expect(response.ok).toBe(true)
    const body = (await response.json()) as { source: string }
    expect(body.source).toBe("default")
  })
})
