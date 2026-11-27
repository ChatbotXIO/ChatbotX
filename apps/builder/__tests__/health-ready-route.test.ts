import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkReadiness: vi.fn(),
}))

vi.mock("@chatbotx.io/business/health", () => ({
  checkReadiness: mocks.checkReadiness,
}))

const { GET } = await import("@/app/api/health/ready/route")
const { GET: getLiveness } = await import("@/app/api/health/route")

describe("GET /api/health/ready", () => {
  beforeEach(() => {
    mocks.checkReadiness.mockReset()
  })

  test("returns 200 when the database and cache Redis are ready", async () => {
    mocks.checkReadiness.mockResolvedValue({ db: true, redis: true })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    await expect(response.json()).resolves.toEqual({ db: true, redis: true })
  })

  test.each([
    { db: false, redis: true },
    { db: true, redis: false },
    { db: false, redis: false },
  ])("returns 503 with only the booleans when %o", async (result) => {
    mocks.checkReadiness.mockResolvedValue(result)

    const response = await GET()

    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    const body = await response.json()
    expect(body).toEqual(result)
    expect(Object.keys(body).sort()).toEqual(["db", "redis"])
  })

  test("leaves the liveness endpoint dependency-free", async () => {
    const response = await getLiveness()

    expect(mocks.checkReadiness).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      status: "healthy",
      service: "builder",
    })
  })
})
