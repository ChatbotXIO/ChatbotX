import { getMetricsContentType } from "@chatbotx.io/observability"
import { afterEach, describe, expect, test, vi } from "vitest"
import { GET } from "../src/app/api/metrics/route"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/metrics", () => {
  test("returns 503 when metrics are disabled", async () => {
    vi.stubEnv("METRICS_TOKEN", "")

    const response = await GET(new Request("http://localhost/api/metrics"))

    expect(response.status).toBe(503)
  })

  test.each([
    undefined,
    "Bearer wrong-token",
  ])("returns 401 for an unauthorized request (%s)", async (authorization) => {
    vi.stubEnv("METRICS_TOKEN", "metrics-token")
    const headers = authorization ? { authorization } : undefined

    const response = await GET(
      new Request("http://localhost/api/metrics", { headers }),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe("Bearer")
  })

  test("returns Prometheus metrics for an authorized request", async () => {
    vi.stubEnv("METRICS_TOKEN", "metrics-token")

    const response = await GET(
      new Request("http://localhost/api/metrics", {
        headers: { authorization: "Bearer metrics-token" },
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe(getMetricsContentType())
  })
})
