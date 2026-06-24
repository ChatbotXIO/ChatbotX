import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const isCloud = vi.fn(() => true)
const keys = vi.fn(() => ({ NEXT_PUBLIC_BUILDER_URL: "http://builder.test" }))
vi.mock("../src/keys", () => ({ isCloud, keys }))

const loggerError = vi.fn()
vi.mock("../src/logger", () => ({ logger: { error: loggerError } }))

const { billingService } = await import("../src/enterprise/billing/service")

const PROVISION_URL = "http://builder.test/portal/api/users/provision"

describe("billingService.provisionDefaultPlan", () => {
  beforeEach(() => {
    isCloud.mockReturnValue(true)
    loggerError.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("is a no-op off cloud — never calls the portal", async () => {
    isCloud.mockReturnValue(false)
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await billingService.provisionDefaultPlan({ userId: "u1", tenantId: "t1" })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("posts userId and tenantId to the portal on cloud", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await billingService.provisionDefaultPlan({ userId: "u1", tenantId: "t1" })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(PROVISION_URL)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({ userId: "u1", tenantId: "t1" })
    expect(loggerError).not.toHaveBeenCalled()
  })

  test("swallows and logs a portal request failure", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("portal down")))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      billingService.provisionDefaultPlan({ userId: "u1" }),
    ).resolves.toBeUndefined()
    expect(loggerError).toHaveBeenCalledTimes(1)
  })

  test("logs a non-OK portal response without throwing", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      billingService.provisionDefaultPlan({ userId: "u1", tenantId: "t1" }),
    ).resolves.toBeUndefined()
    expect(loggerError).toHaveBeenCalledTimes(1)
    expect(loggerError.mock.calls[0][0]).toMatchObject({ status: 500 })
  })
})
