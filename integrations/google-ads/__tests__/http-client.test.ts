import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock("ky", () => ({
  default: { create: mocks.create },
}))

mocks.create.mockImplementation(() => ({ get: mocks.get, post: mocks.post }))

const { listAccessibleCustomers, getCustomer } = await import(
  "../src/apis/google-ads"
)
const { dataManagerIngestEvent } = await import("../src/apis/data-manager")

// Vitest resets mocks between tests; keep what module load passed to ky.create.
const createOptions = mocks.create.mock.calls.map(([options]) => options)

const jsonOf = (value: unknown) => ({ json: () => Promise.resolve(value) })
const failing = (status: number, data?: unknown) => ({
  json: () =>
    Promise.reject(
      Object.assign(new Error(`HTTP ${status}`), {
        response: { status },
        data,
      }),
    ),
})

const credentials = {
  accessToken: "tok",
  developerToken: "dev-token",
  loginCustomerId: "9998887777",
}

beforeEach(() => {
  mocks.get.mockReset()
  mocks.post.mockReset()
})

describe("google ads http clients", () => {
  test("are created once per API with no HTTP-level retry (BullMQ owns retries)", () => {
    expect(createOptions).toHaveLength(2)
    for (const options of createOptions) {
      expect(options).toMatchObject({ retry: { limit: 0 } })
    }
    expect(createOptions.map((o) => o.baseUrl)).toEqual([
      expect.stringContaining("googleads.googleapis.com"),
      expect.stringContaining("datamanager.googleapis.com"),
    ])
  })

  test("sends developer-token and login-customer-id headers to the Ads API", async () => {
    mocks.get.mockReturnValue(jsonOf({ resourceNames: ["customers/1"] }))

    await listAccessibleCustomers({
      accessToken: credentials.accessToken,
      developerToken: credentials.developerToken,
    })

    expect(mocks.get).toHaveBeenCalledWith(
      "./customers:listAccessibleCustomers",
      {
        headers: {
          Authorization: "Bearer tok",
          "developer-token": "dev-token",
        },
      },
    )
  })

  test("adds login-customer-id only when reaching a customer through a manager", async () => {
    mocks.post.mockReturnValue(jsonOf([{ results: [] }]))

    await getCustomer(credentials, "1112223333")

    expect(mocks.post.mock.calls[0][1].headers).toEqual({
      Authorization: "Bearer tok",
      "developer-token": "dev-token",
      "login-customer-id": "9998887777",
    })
  })

  test("Data Manager requests carry the bearer token only", async () => {
    mocks.post.mockReturnValue(jsonOf({ requestId: "r" }))

    await dataManagerIngestEvent({
      accessToken: "tok",
      loginAccountId: "1112223333",
      operatingAccountId: "4445556666",
      conversionActionId: "1",
      event: {
        transactionId: "t",
        eventTimestamp: new Date(0),
        clickIdType: "gclid",
        clickId: "CLICK",
      },
    })

    expect(mocks.post.mock.calls[0][1].headers).toEqual({
      Authorization: "Bearer tok",
    })
  })

  test("maps a 503 to a retryable typed exception without a second request", async () => {
    mocks.get.mockReturnValue(failing(503))

    await expect(
      listAccessibleCustomers({ accessToken: "t", developerToken: "d" }),
    ).rejects.toMatchObject({ httpStatusCode: 503, retryable: true })
    expect(mocks.get).toHaveBeenCalledTimes(1)
  })

  test("maps a 400 to a terminal exception and a 401 to an auth exception", async () => {
    mocks.get.mockReturnValueOnce(
      failing(400, { error: { status: "INVALID_ARGUMENT", message: "bad" } }),
    )
    await expect(
      listAccessibleCustomers({ accessToken: "t", developerToken: "d" }),
    ).rejects.toMatchObject({ httpStatusCode: 400, retryable: false })

    mocks.get.mockReturnValueOnce(failing(401))
    await expect(
      listAccessibleCustomers({ accessToken: "t", developerToken: "d" }),
    ).rejects.toMatchObject({ message: "Google Ads credentials were rejected" })
  })

  test("a malformed error body still classifies by HTTP status", async () => {
    mocks.get.mockReturnValue(failing(500, { error: { details: "oops" } }))

    await expect(
      listAccessibleCustomers({ accessToken: "t", developerToken: "d" }),
    ).rejects.toMatchObject({ httpStatusCode: 500, retryable: true })
  })
})
