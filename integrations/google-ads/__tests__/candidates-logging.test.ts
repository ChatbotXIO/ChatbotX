import ky from "ky"
import { describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  listAccessibleCustomers: vi.fn(),
  getCustomer: vi.fn(),
  listClientCustomers: vi.fn(),
}))

vi.mock("../src/logger", () => ({
  googleAdsLogger: { warn: mocks.warn, info: mocks.info },
}))
vi.mock("../src/apis/google-ads", () => ({
  listAccessibleCustomers: mocks.listAccessibleCustomers,
  getCustomer: mocks.getCustomer,
  listClientCustomers: mocks.listClientCustomers,
}))

const { GoogleAdsException } = await import("../src/exception")
const { collectCandidateAccounts } = await import("../src/candidates")

describe("collectCandidateAccounts logging", () => {
  test("logs only the sanitized message of provider errors, never the raw error", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue([
      "1111111111",
      "2222222222",
    ])
    mocks.getCustomer.mockImplementation((_c, id: string) =>
      id === "1111111111"
        ? Promise.reject(
            Object.assign(new Error("denied Bearer ya29.lookup-secret"), {
              config: { headers: { "developer-token": "dev" } },
            }),
          )
        : Promise.resolve({
            id,
            descriptiveName: "M",
            manager: true,
            status: "ENABLED",
            currencyCode: "USD",
          }),
    )
    mocks.listClientCustomers.mockRejectedValue(
      new Error("boom access_token=ya29.client-secret"),
    )

    await collectCandidateAccounts({ accessToken: "t", developerToken: "d" })

    expect(mocks.warn).toHaveBeenCalledTimes(2)
    for (const [fields] of mocks.warn.mock.calls) {
      expect(typeof fields.err).toBe("string")
    }
    const logged = JSON.stringify(mocks.warn.mock.calls)
    expect(logged).not.toContain("ya29.lookup-secret")
    expect(logged).not.toContain("ya29.client-secret")
    expect(logged).not.toContain("developer-token")
  })
})

describe("collectCandidateAccounts transient expansion failures", () => {
  const manager = {
    id: "1111111111",
    descriptiveName: "M",
    manager: true,
    status: "ENABLED",
    currencyCode: "USD",
  }

  test("a timed-out expansion with no other candidate is rethrown (retryable), not an empty list", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue(["1111111111"])
    mocks.getCustomer.mockResolvedValue(manager)
    const timeout = Object.assign(new Error("timed out"), {
      name: "TimeoutError",
    })
    mocks.listClientCustomers.mockRejectedValue(timeout)

    await expect(
      collectCandidateAccounts({ accessToken: "t", developerToken: "d" }),
    ).rejects.toBe(timeout)
  })

  test("a timed-out expansion next to a direct account keeps the direct account", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue([
      "1111111111",
      "2222222222",
    ])
    mocks.getCustomer.mockImplementation((_c, id: string) =>
      Promise.resolve(
        id === "1111111111"
          ? manager
          : { ...manager, id, manager: false, descriptiveName: "D" },
      ),
    )
    mocks.listClientCustomers.mockRejectedValue(
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
    )

    const accounts = await collectCandidateAccounts({
      accessToken: "t",
      developerToken: "d",
    })

    expect(accounts.map((a) => a.customerId)).toEqual(["2222222222"])
  })

  test("the real ky NetworkError (socket refused) counts as transient, not as 'no accounts'", async () => {
    // Port 1 has no listener: ky rejects with its own NetworkError whose
    // socket error sits under `cause`, exactly what a production reset looks like.
    const networkError = await ky
      .get("http://127.0.0.1:1/", { retry: { limit: 0 } })
      .json()
      .catch((error: unknown) => error)
    expect(networkError).toBeInstanceOf(Error)
    mocks.listAccessibleCustomers.mockResolvedValue(["1111111111"])
    mocks.getCustomer.mockResolvedValue(manager)
    mocks.listClientCustomers.mockRejectedValue(networkError)

    await expect(
      collectCandidateAccounts({ accessToken: "t", developerToken: "d" }),
    ).rejects.toBe(networkError)
  })
})

describe("collectCandidateAccounts inactive customers", () => {
  const inactive = () =>
    new GoogleAdsException({
      httpStatusCode: 403,
      reason: "CUSTOMER_NOT_ENABLED",
      details: [],
    })
  const enabled = (id: string) => ({
    id,
    descriptiveName: "Live",
    manager: false,
    status: "ENABLED",
    currencyCode: "USD",
  })

  test("every customer not enabled yields no candidates instead of an error", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue([
      "1111111111",
      "2222222222",
    ])
    mocks.getCustomer.mockRejectedValue(inactive())

    await expect(
      collectCandidateAccounts({ accessToken: "t", developerToken: "d" }),
    ).resolves.toEqual([])
  })

  test("a mix keeps only the enabled account and logs the skip at info", async () => {
    mocks.info.mockClear()
    mocks.warn.mockClear()
    mocks.listAccessibleCustomers.mockResolvedValue([
      "1111111111",
      "2222222222",
    ])
    mocks.getCustomer.mockImplementation((_c, id: string) =>
      id === "1111111111"
        ? Promise.reject(inactive())
        : Promise.resolve(enabled(id)),
    )

    const accounts = await collectCandidateAccounts({
      accessToken: "t",
      developerToken: "d",
    })

    expect(accounts.map((a) => a.customerId)).toEqual(["2222222222"])
    expect(mocks.info).toHaveBeenCalledWith(
      { customerId: "1111111111", reason: "CUSTOMER_NOT_ENABLED" },
      expect.any(String),
    )
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  test("an inactive account does not mask a real failure of another one", async () => {
    const denied = new GoogleAdsException({
      httpStatusCode: 403,
      reason: "DEVELOPER_TOKEN_NOT_APPROVED",
      details: [],
    })
    mocks.listAccessibleCustomers.mockResolvedValue([
      "1111111111",
      "2222222222",
    ])
    mocks.getCustomer.mockImplementation((_c, id: string) =>
      Promise.reject(id === "1111111111" ? inactive() : denied),
    )

    await expect(
      collectCandidateAccounts({ accessToken: "t", developerToken: "d" }),
    ).rejects.toBe(denied)
  })
})

describe("collectCandidateAccounts project not approved", () => {
  const notApproved = () =>
    new GoogleAdsException({
      httpStatusCode: 403,
      reason: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION",
      reasonCategory: "authorizationError",
      message: "The Google Cloud project 987654 is not approved",
      details: [],
    })
  const inactive = () =>
    new GoogleAdsException({
      httpStatusCode: 403,
      reason: "CUSTOMER_NOT_ENABLED",
      details: [],
    })

  test("is thrown when only inactive customers accompany it", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue(["1", "2", "3"])
    mocks.getCustomer.mockImplementation((_c, id: string) =>
      Promise.reject(id === "3" ? notApproved() : inactive()),
    )

    await expect(
      collectCandidateAccounts({ accessToken: "t", developerToken: "d" }),
    ).rejects.toMatchObject({
      reason: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION",
    })
  })

  test("keeps a good account and logs only a sanitized warning", async () => {
    mocks.warn.mockClear()
    mocks.listAccessibleCustomers.mockResolvedValue(["1", "3"])
    mocks.getCustomer.mockImplementation((_c, id: string) =>
      id === "3"
        ? Promise.reject(notApproved())
        : Promise.resolve({
            id,
            descriptiveName: "Good",
            manager: false,
            status: "ENABLED",
            currencyCode: "USD",
          }),
    )

    const accounts = await collectCandidateAccounts({
      accessToken: "t",
      developerToken: "d",
    })

    expect(accounts.map((a) => a.customerId)).toEqual(["1"])
    expect(mocks.warn).toHaveBeenCalledTimes(1)
    expect(typeof mocks.warn.mock.calls[0]?.[0].err).toBe("string")
  })
})
