import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"

// A real HTTP server on the other end: the unit tests that mock `ky` cannot see
// how a path like `events:ingest` is resolved against the base URL.
const seen: string[] = []
let server: Server
let origin = ""

vi.mock("../src/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/constants")>()
  return {
    ...actual,
    get GOOGLE_ADS_API_URL() {
      return `${origin}/v25/`
    },
    get DATA_MANAGER_API_URL() {
      return `${origin}/v1/`
    },
  }
})

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`)
    res.setHeader("content-type", "application/json")
    res.end("{}")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

describe("google ads http client URL resolution", () => {
  const options = { headers: { Authorization: "Bearer t" } }

  test("a colon-first path (events:ingest) stays under the Data Manager base URL", async () => {
    const { dataManagerHttp } = await import("../src/lib/http-client")

    await dataManagerHttp.post("events:ingest", { ...options, json: {} })

    expect(seen.at(-1)).toBe("POST /v1/events:ingest")
  })

  test("requestStatus:retrieve is resolved the same way", async () => {
    const { dataManagerHttp } = await import("../src/lib/http-client")

    await dataManagerHttp.get("requestStatus:retrieve", options)

    expect(seen.at(-1)).toBe("GET /v1/requestStatus:retrieve")
  })

  test("customers:listAccessibleCustomers stays under the Google Ads base URL", async () => {
    const { googleAdsHttp } = await import("../src/lib/http-client")

    await googleAdsHttp.get("customers:listAccessibleCustomers", options)

    expect(seen.at(-1)).toBe("GET /v25/customers:listAccessibleCustomers")
  })

  test("a nested path with a later colon keeps working", async () => {
    const { googleAdsHttp } = await import("../src/lib/http-client")

    await googleAdsHttp.post("customers/1234567890/googleAds:searchStream", {
      ...options,
      json: {},
    })

    expect(seen.at(-1)).toBe(
      "POST /v25/customers/1234567890/googleAds:searchStream",
    )
  })
})
