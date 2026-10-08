import { describe, expect, test, vi } from "vitest"

import {
  baseAuth,
  batch,
  CLIENT_A,
  CLIENT_B,
  credentials,
  customerRow,
  DIRECT,
  INGEST,
  LIST_ACCESSIBLE,
  MANAGER,
  requests,
  route,
  STATUS,
  STREAM,
  useWireServer,
} from "./helpers/wire-server"

vi.mock("../src/constants", async (importOriginal) =>
  (await import("./helpers/wire-server")).mockConstants(
    await importOriginal<typeof import("../src/constants")>(),
  ),
)

vi.mock("../src/client", async (importOriginal) =>
  (await import("./helpers/wire-server")).mockClient(
    await importOriginal<typeof import("../src/client")>(),
  ),
)

useWireServer()

describe("listAccessibleCustomers", () => {
  test("sends bearer + developer-token (no login-customer-id) and strips the resource prefix", async () => {
    route(LIST_ACCESSIBLE, {
      json: { resourceNames: [`customers/${MANAGER}`, `customers/${DIRECT}`] },
    })
    const { listAccessibleCustomers } = await import("../src/apis/google-ads")

    const ids = await listAccessibleCustomers(credentials)

    expect(ids).toEqual([MANAGER, DIRECT])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.authorization).toBe("Bearer ya29.access")
    expect(requests[0]?.headers["developer-token"]).toBe("dev-token-abc")
    expect(requests[0]?.headers["login-customer-id"]).toBeUndefined()
  })

  test("omits the developer-token header when no token is configured", async () => {
    route(LIST_ACCESSIBLE, { json: { resourceNames: [`customers/${DIRECT}`] } })
    const { listAccessibleCustomers } = await import("../src/apis/google-ads")

    await listAccessibleCustomers({
      accessToken: credentials.accessToken,
    })

    expect(requests[0]?.headers.authorization).toBe("Bearer ya29.access")
    expect(requests[0]?.headers["developer-token"]).toBeUndefined()
  })

  test("proto3 omits an empty repeated field: `{}` means no customers", async () => {
    route(LIST_ACCESSIBLE, { json: {} })
    const { listAccessibleCustomers } = await import("../src/apis/google-ads")

    expect(await listAccessibleCustomers(credentials)).toEqual([])
  })
})

describe("searchStream readers", () => {
  test("getCustomer posts the GAQL query as JSON and maps a real batch array", async () => {
    route(STREAM(MANAGER), {
      json: [
        batch([
          customerRow(MANAGER, {
            manager: true,
            conversionTrackingSetting: {
              conversionTrackingId: "123456",
              googleAdsConversionCustomer: `customers/${DIRECT}`,
              acceptedCustomerDataTerms: true,
              conversionTrackingStatus: "CONVERSION_TRACKING_MANAGED_BY_SELF",
            },
          }),
        ]),
      ],
    })
    const { getCustomer } = await import("../src/apis/google-ads")

    const customer = await getCustomer(
      { ...credentials, loginCustomerId: MANAGER },
      MANAGER,
    )

    expect(customer).toEqual({
      id: MANAGER,
      descriptiveName: `Account ${MANAGER}`,
      manager: true,
      status: "ENABLED",
      currencyCode: "USD",
      conversionCustomerId: DIRECT,
      acceptedCustomerDataTerms: true,
      conversionTrackingStatus: "CONVERSION_TRACKING_MANAGED_BY_SELF",
    })
    const sent = requests[0]
    expect(sent?.headers["login-customer-id"]).toBe(MANAGER)
    expect(sent?.headers["content-type"]).toContain("application/json")
    expect(sent?.json).toEqual({
      query: expect.stringContaining("FROM customer"),
    })
  })

  test("a batch with `results` omitted (no rows) yields null, as does an empty stream", async () => {
    route(STREAM(DIRECT), {
      json: [{ fieldMask: "customer.id", requestId: "r" }],
    })
    const { getCustomer } = await import("../src/apis/google-ads")
    expect(await getCustomer(credentials, DIRECT)).toBeNull()

    route(STREAM(DIRECT), { json: [] })
    expect(await getCustomer(credentials, DIRECT)).toBeNull()
  })

  test("customer fields that proto3 omits (manager=false, no tracking setting) get defaults", async () => {
    route(STREAM(DIRECT), {
      json: [
        batch([
          {
            customer: { resourceName: `customers/${DIRECT}`, id: DIRECT },
          },
        ]),
      ],
    })
    const { getCustomer } = await import("../src/apis/google-ads")

    expect(await getCustomer(credentials, DIRECT)).toEqual({
      id: DIRECT,
      descriptiveName: null,
      manager: false,
      status: null,
      currencyCode: null,
      conversionCustomerId: null,
      acceptedCustomerDataTerms: null,
      conversionTrackingStatus: null,
    })
  })

  test("listClientCustomers sends the manager as login-customer-id and flattens several batches", async () => {
    const clientRow = (id: string) => ({
      customerClient: {
        resourceName: `customers/${MANAGER}/customerClients/${id}`,
        clientCustomer: `customers/${id}`,
        id,
        descriptiveName: `Client ${id}`,
        currencyCode: "EUR",
        status: "ENABLED",
      },
    })
    route(STREAM(MANAGER), {
      json: [
        batch([clientRow(CLIENT_A)], "r1"),
        batch([clientRow(CLIENT_B)], "r2"),
      ],
    })
    const { listClientCustomers } = await import("../src/apis/google-ads")

    const clients = await listClientCustomers(credentials, MANAGER)

    expect(clients).toEqual([
      {
        id: CLIENT_A,
        descriptiveName: `Client ${CLIENT_A}`,
        currencyCode: "EUR",
      },
      {
        id: CLIENT_B,
        descriptiveName: `Client ${CLIENT_B}`,
        currencyCode: "EUR",
      },
    ])
    expect(requests[0]?.headers["login-customer-id"]).toBe(MANAGER)
    expect((requests[0]?.json as { query: string }).query).toContain(
      "FROM customer_client",
    )
  })

  test("listUploadClickConversionActions maps int64-as-string ids and lookback windows", async () => {
    route(STREAM(DIRECT), {
      json: [
        batch([
          {
            conversionAction: {
              resourceName: `customers/${DIRECT}/conversionActions/987654`,
              type: "UPLOAD_CLICKS",
              id: "987654",
              name: "Chat purchase",
              category: "PURCHASE",
              status: "ENABLED",
              countingType: "ONE_PER_CLICK",
              clickThroughLookbackWindowDays: "30",
              attributionModelSettings: {
                attributionModel: "GOOGLE_ADS_LAST_CLICK",
                dataDrivenModelStatus: "UNKNOWN",
              },
            },
          },
          {
            // Third-party (external) attribution: Data Manager cannot ingest it.
            conversionAction: {
              resourceName: `customers/${DIRECT}/conversionActions/777`,
              id: "777",
              name: "External",
              attributionModelSettings: { attributionModel: "EXTERNAL" },
            },
          },
          {
            // Enum defaults and an int64 equal to 0 are omitted by proto3 JSON.
            conversionAction: {
              resourceName: `customers/${DIRECT}/conversionActions/555`,
              id: "555",
              name: "Bare",
            },
          },
        ]),
      ],
    })
    const { listUploadClickConversionActions } = await import(
      "../src/apis/google-ads"
    )

    const actions = await listUploadClickConversionActions(credentials, DIRECT)

    expect(actions).toEqual([
      {
        id: "987654",
        resourceName: `customers/${DIRECT}/conversionActions/987654`,
        name: "Chat purchase",
        category: "PURCHASE",
        status: "ENABLED",
        countingType: "ONE_PER_CLICK",
        clickThroughLookbackWindowDays: 30,
        attributionModel: "GOOGLE_ADS_LAST_CLICK",
      },
      {
        id: "777",
        resourceName: `customers/${DIRECT}/conversionActions/777`,
        name: "External",
        category: "DEFAULT",
        status: "UNKNOWN",
        countingType: "UNKNOWN",
        clickThroughLookbackWindowDays: null,
        attributionModel: "EXTERNAL",
      },
      {
        id: "555",
        resourceName: `customers/${DIRECT}/conversionActions/555`,
        name: "Bare",
        category: "DEFAULT",
        status: "UNKNOWN",
        countingType: "UNKNOWN",
        clickThroughLookbackWindowDays: null,
        attributionModel: null,
      },
    ])
    // https://developers.google.com/google-ads/api/fields/v25/conversion_action
    const query = (requests[0]?.json as { query: string }).query
    expect(query).toContain(
      "conversion_action.attribution_model_settings.attribution_model",
    )
  })
})

describe("integration actions end to end", () => {
  const ctx = (loginCustomerId: string | null) =>
    ({
      auth: {
        ...baseAuth(),
        metadata: { customerId: DIRECT, loginCustomerId },
      },
    }) as never

  test("resolveConversionCustomer queries the connected customer under its login customer", async () => {
    route(STREAM(DIRECT), {
      json: [
        batch([
          customerRow(DIRECT, {
            conversionTrackingSetting: {
              googleAdsConversionCustomer: `customers/${MANAGER}`,
            },
          }),
        ]),
      ],
    })
    const { integration } = await import("../src/integration")

    const customer = await integration.actions.resolveConversionCustomer({
      ctx: ctx(MANAGER),
      props: { developerToken: "dev-token-abc" },
    })

    expect(customer.conversionCustomerId).toBe(MANAGER)
    expect(requests[0]?.headers["login-customer-id"]).toBe(MANAGER)
    expect(requests[0]?.headers["developer-token"]).toBe("dev-token-abc")
  })

  test("listConversionActions and retrieveRequestStatus/ingestEvent go through the real wire", async () => {
    route(STREAM(DIRECT), {
      json: [
        batch([
          {
            conversionAction: {
              resourceName: `customers/${DIRECT}/conversionActions/9`,
              id: "9",
              name: "N",
              clickThroughLookbackWindowDays: "90",
            },
          },
        ]),
      ],
    })
    route(INGEST, { json: { requestId: "rq" } })
    route(STATUS, {
      json: { requestStatusPerDestination: [{ requestStatus: "SUCCESS" }] },
    })
    const { integration } = await import("../src/integration")

    const actions = await integration.actions.listConversionActions({
      ctx: ctx(null),
      props: { developerToken: "dev-token-abc", conversionCustomerId: DIRECT },
    })
    expect(actions[0]?.clickThroughLookbackWindowDays).toBe(90)
    expect(requests[0]?.headers["login-customer-id"]).toBeUndefined()

    const ingested = await integration.actions.ingestEvent({
      ctx: ctx(null),
      props: {
        loginAccountId: DIRECT,
        operatingAccountId: DIRECT,
        conversionActionId: "9",
        event: {
          transactionId: "t",
          eventTimestamp: new Date("2026-01-02T03:04:05Z"),
          clickIdType: "gclid",
          clickId: "g",
        },
      },
    })
    expect(ingested).toMatchObject({ kind: "accepted", requestId: "rq" })

    const status = await integration.actions.retrieveRequestStatus({
      ctx: ctx(null),
      props: { requestId: "rq" },
    })
    expect(status[0]?.requestStatus).toBe("SUCCESS")
  })
})

describe("conversion actions of another account use the connection's login route", () => {
  const listFor = async (loginCustomerId: string | null) => {
    route(STREAM(MANAGER), { json: [batch([])] })
    const { integration } = await import("../src/integration")
    await integration.actions.listConversionActions({
      ctx: {
        auth: {
          ...baseAuth(),
          metadata: { customerId: DIRECT, loginCustomerId },
        },
      } as never,
      props: {
        developerToken: "dev-token-abc",
        conversionCustomerId: MANAGER,
      },
    })
    return requests[0]
  }

  test("reached through a manager: the same login-customer-id", async () => {
    expect((await listFor(CLIENT_A))?.headers["login-customer-id"]).toBe(
      CLIENT_A,
    )
  })

  test("reached directly: no login-customer-id (the owner is read as itself)", async () => {
    expect((await listFor(null))?.headers["login-customer-id"]).toBeUndefined()
  })
})
