import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }))

vi.mock("../src/lib/http-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/http-client")>()
  return { ...actual, googleAdsHttp: { post: mocks.post, get: mocks.get } }
})

const {
  getCustomer,
  getUploadClickConversionReport,
  listAccessibleCustomers,
  listClientCustomers,
  listUploadClickConversionActions,
} = await import("../src/apis/google-ads")

const credentials = { accessToken: "tok", developerToken: "dev" }

beforeEach(() => vi.clearAllMocks())

describe("listAccessibleCustomers", () => {
  test("sends the developer token and strips the resource prefix", async () => {
    mocks.get.mockResolvedValue({
      resourceNames: ["customers/111", "customers/222"],
    })

    await expect(listAccessibleCustomers(credentials)).resolves.toEqual([
      "111",
      "222",
    ])
    expect(mocks.get).toHaveBeenCalledWith(
      "customers:listAccessibleCustomers",
      {
        headers: { Authorization: "Bearer tok", "developer-token": "dev" },
      },
    )
  })

  test("returns an empty list when the user has no accounts", async () => {
    mocks.get.mockResolvedValue({})

    await expect(listAccessibleCustomers(credentials)).resolves.toEqual([])
  })
})

describe("getCustomer", () => {
  test("maps the conversion customer and data-terms flag", async () => {
    mocks.post.mockResolvedValue([
      {
        results: [
          {
            customer: {
              id: "1234567890",
              descriptiveName: "Shop",
              currencyCode: "VND",
              status: "ENABLED",
              conversionTrackingSetting: {
                googleAdsConversionCustomer: "customers/9999999999",
                acceptedCustomerDataTerms: true,
                conversionTrackingStatus: "CONVERSION_TRACKING_MANAGED_BY_SELF",
              },
            },
          },
        ],
      },
    ])

    const customer = await getCustomer(
      { ...credentials, loginCustomerId: "5555555555" },
      "123-456-7890",
    )

    expect(customer).toMatchObject({
      id: "1234567890",
      manager: false,
      currencyCode: "VND",
      conversionCustomerId: "9999999999",
      acceptedCustomerDataTerms: true,
    })
    const [url, options] = mocks.post.mock.calls[0]
    expect(url).toBe("customers/1234567890/googleAds:searchStream")
    expect(options.headers["login-customer-id"]).toBe("5555555555")
    expect(options.json.query).toContain("FROM customer LIMIT 1")
  })

  test("leaves the conversion customer null when tracking is not set up", async () => {
    mocks.post.mockResolvedValue([
      { results: [{ customer: { id: "1234567890" } }] },
    ])

    await expect(getCustomer(credentials, "1234567890")).resolves.toMatchObject(
      {
        conversionCustomerId: null,
        acceptedCustomerDataTerms: null,
      },
    )
  })

  test("reads an omitted acceptedCustomerDataTerms as not accepted (proto3 leaves false out)", async () => {
    mocks.post.mockResolvedValue([
      {
        results: [
          {
            customer: {
              id: "1234567890",
              conversionTrackingSetting: {
                conversionTrackingStatus: "CONVERSION_TRACKING_MANAGED_BY_SELF",
              },
            },
          },
        ],
      },
    ])

    await expect(getCustomer(credentials, "1234567890")).resolves.toMatchObject(
      { acceptedCustomerDataTerms: false },
    )
  })

  test("returns null when Google returns no row", async () => {
    mocks.post.mockResolvedValue([{ results: [] }])

    await expect(getCustomer(credentials, "1234567890")).resolves.toBeNull()
  })

  test("rejects a malformed customer id before any request", async () => {
    await expect(getCustomer(credentials, "12/../34")).rejects.toThrow()
    expect(mocks.post).not.toHaveBeenCalled()
  })
})

describe("listClientCustomers", () => {
  test("queries enabled non-manager clients through the manager", async () => {
    mocks.post.mockResolvedValue([
      {
        results: [{ customerClient: { id: "222", descriptiveName: "Client" } }],
      },
    ])

    const clients = await listClientCustomers(credentials, "1111111111")

    expect(clients).toEqual([
      { id: "222", descriptiveName: "Client", currencyCode: null },
    ])
    const [, options] = mocks.post.mock.calls[0]
    expect(options.headers["login-customer-id"]).toBe("1111111111")
    expect(options.json.query).toContain("customer_client.manager = false")
  })
})

describe("listUploadClickConversionActions", () => {
  test("maps actions of every status with their lookback window", async () => {
    mocks.post.mockResolvedValue([
      {
        results: [
          {
            conversionAction: {
              id: "7",
              resourceName: "customers/1/conversionActions/7",
              name: "Qualified lead",
              category: "QUALIFIED_LEAD",
              status: "ENABLED",
              countingType: "MANY_PER_CLICK",
              clickThroughLookbackWindowDays: "30",
            },
          },
          {
            conversionAction: {
              id: "8",
              resourceName: "customers/1/conversionActions/8",
              name: "Old",
            },
          },
        ],
      },
    ])

    const actions = await listUploadClickConversionActions(
      credentials,
      "1111111111",
    )

    expect(actions[0]).toEqual({
      id: "7",
      resourceName: "customers/1/conversionActions/7",
      name: "Qualified lead",
      category: "QUALIFIED_LEAD",
      status: "ENABLED",
      countingType: "MANY_PER_CLICK",
      clickThroughLookbackWindowDays: 30,
      attributionModel: null,
    })
    expect(actions[1]).toMatchObject({
      category: "DEFAULT",
      status: "UNKNOWN",
      clickThroughLookbackWindowDays: null,
    })
    expect(mocks.post.mock.calls[0][1].json.query).toContain(
      "conversion_action.type = 'UPLOAD_CLICKS'",
    )
  })
})

describe("getUploadClickConversionReport", () => {
  const range = { from: "2026-10-01", to: "2026-10-08" }

  test("maps per-day rows by the action id in the resource name", async () => {
    mocks.post.mockResolvedValue([
      {
        results: [
          {
            segments: {
              date: "2026-10-02",
              conversionAction: "customers/1/conversionActions/7",
              conversionActionName: "Qualified lead",
            },
            metrics: {
              conversionsByConversionDate: 3,
              conversionsValueByConversionDate: 45.5,
            },
          },
          // Proto3 omits zero metrics.
          {
            segments: {
              date: "2026-10-03",
              conversionAction: "customers/1/conversionActions/7",
            },
          },
          // A row without an action resource is dropped.
          { segments: { date: "2026-10-04" } },
        ],
      },
    ])

    await expect(
      getUploadClickConversionReport(credentials, "1234567890", range),
    ).resolves.toEqual([
      {
        date: "2026-10-02",
        conversionActionId: "7",
        name: "Qualified lead",
        conversions: 3,
        value: 45.5,
      },
      {
        date: "2026-10-03",
        conversionActionId: "7",
        name: "7",
        conversions: 0,
        value: 0,
      },
    ])
    const query = (mocks.post.mock.calls[0]?.[1] as { json: { query: string } })
      .json.query
    expect(query).toContain("FROM customer")
    expect(query).toContain("BETWEEN '2026-10-01' AND '2026-10-08'")
  })

  test("refuses a range that is not a plain date before building GAQL", async () => {
    await expect(
      getUploadClickConversionReport(credentials, "1234567890", {
        from: "2026-10-01' OR 1=1 --",
        to: "2026-10-08",
      }),
    ).rejects.toThrow("YYYY-MM-DD")
    expect(mocks.post).not.toHaveBeenCalled()
  })
})
