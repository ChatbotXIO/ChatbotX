import { beforeEach, describe, expect, test, vi } from "vitest"

type Handler = (args: { input: Record<string, unknown> }) => Promise<unknown>

type Captured = {
  route?: { method: string; path: string; tags: string[] }
  middleware?: unknown
  mapper?: (input: Record<string, unknown>) => string
  output?: { parse: (value: unknown) => Record<string, unknown> }
  handler?: Handler
}

const { routes, mocks, workspaceAuthorizedMidddleware } = vi.hoisted(() => {
  // One entry per registered route, keyed by path, so each endpoint is asserted
  // against its own middleware/handler instead of whichever registered last.
  const byPath: Record<string, Captured> = {}
  let current: Captured = {}
  const procedure = {
    input: vi.fn(() => procedure),
    use: vi.fn((middleware: unknown, mapper: never) => {
      current.middleware = middleware
      current.mapper = mapper
      return procedure
    }),
    output: vi.fn((schema: never) => {
      current.output = schema
      return procedure
    }),
    handler: vi.fn((handler: Handler) => {
      current.handler = handler
      return { handler }
    }),
  }
  return {
    routes: byPath,
    mocks: {
      getPublicSetup: vi.fn(),
      getConsent: vi.fn(),
      assertWorkspaceSuperAdmin: vi.fn(),
      listEvents: vi.fn(),
      findLatestInFlightByProvider: vi.fn(),
      route: vi.fn((config: { path: string }) => {
        current = {}
        byPath[config.path] = current
        current.route = config as Captured["route"]
        return procedure
      }),
    },
    workspaceAuthorizedMidddleware: vi.fn(),
  }
})

vi.mock("@/orpc", () => ({ authorizedAPI: { route: mocks.route } }))
vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware }))
vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mocks.assertWorkspaceSuperAdmin,
}))
vi.mock("@chatbotx.io/business", () => ({
  integrationGoogleAdsService: { getPublicSetup: mocks.getPublicSetup },
  googleAdsSettingsService: { getConsent: mocks.getConsent },
  googleAdsConversionService: { listEvents: mocks.listEvents },
}))
vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: {
    findLatestInFlightByProvider: mocks.findLatestInFlightByProvider,
  },
}))

import { googleAdsAPI } from "@/features/integration-google-ads/api"
import { listGoogleAdsEventsRequest } from "@/features/integration-google-ads/schema/events"

const state = routes[
  "/workspaces/{workspaceId}/google-ads/integration"
] as Captured

const safeSetup = {
  connected: true,
  readiness: "ready",
  customerId: "1112223333",
  descriptiveName: "Acme",
  currencyCode: "USD",
  uploadMethod: "dataManager",
  acceptedCustomerDataTerms: true,
  setupError: null,
  conversionActions: [
    {
      id: "1",
      name: "Lead",
      category: "SIGNUP",
      status: "ENABLED",
      countingType: "ONE_PER_CLICK",
      attributionModel: null,
    },
  ],
  conversionActionsSyncedAt: new Date("2026-10-01T00:00:00Z"),
}

const absentConsent = {
  status: "absent",
  consent: {
    adUserData: { type: "notProvided" },
    adPersonalization: { type: "notProvided" },
  },
}
const notProvidedView = { type: "notProvided", template: null }

describe("googleAdsAPI.getIntegration", () => {
  beforeEach(() => {
    mocks.getPublicSetup.mockReset()
    mocks.getConsent.mockReset()
    mocks.getConsent.mockResolvedValue(absentConsent)
  })

  test("is a workspace-membership endpoint, not a super-admin one", async () => {
    expect(googleAdsAPI).toHaveProperty("getIntegration")
    expect(state.route).toMatchObject({
      method: "GET",
      path: "/workspaces/{workspaceId}/google-ads/integration",
    })
    expect(state.middleware).toBe(workspaceAuthorizedMidddleware)
    expect(state.mapper?.({ workspaceId: "ws-1" })).toBe("ws-1")

    mocks.getPublicSetup.mockResolvedValueOnce(safeSetup)
    await state.handler?.({ input: { workspaceId: "ws-1" } })

    expect(mocks.assertWorkspaceSuperAdmin).not.toHaveBeenCalled()
    expect(mocks.getPublicSetup).toHaveBeenCalledWith("ws-1")
  })

  test("returns the service projection", async () => {
    mocks.getPublicSetup.mockResolvedValueOnce(safeSetup)

    await expect(
      state.handler?.({ input: { workspaceId: "ws-1" } }),
    ).resolves.toEqual({
      ...safeSetup,
      consent: {
        status: "absent",
        adUserData: notProvidedView,
        adPersonalization: notProvidedView,
      },
    })
  })

  test("returns consent even when nothing is connected", async () => {
    mocks.getPublicSetup.mockResolvedValueOnce({
      connected: false,
      readiness: null,
      customerId: null,
      descriptiveName: null,
      currencyCode: null,
      uploadMethod: null,
      acceptedCustomerDataTerms: null,
      setupError: null,
      conversionActions: [],
      conversionActionsSyncedAt: null,
    })
    mocks.getConsent.mockResolvedValueOnce({
      status: "ok",
      consent: {
        adUserData: { type: "variable", template: "{{gdpr}}" },
        adPersonalization: { type: "denied" },
      },
    })

    const result = await state.handler?.({ input: { workspaceId: "ws-1" } })

    expect(mocks.getConsent).toHaveBeenCalledWith("ws-1")
    expect(result).toMatchObject({
      connected: false,
      uploadMethod: null,
      consent: {
        status: "ok",
        adUserData: { type: "variable", template: "{{gdpr}}" },
        adPersonalization: { type: "denied", template: null },
      },
    })
    expect(() => state.output?.parse(result)).not.toThrow()
  })

  test("an unreadable stored consent is reported as invalid", async () => {
    mocks.getPublicSetup.mockResolvedValueOnce(safeSetup)
    mocks.getConsent.mockResolvedValueOnce({ status: "invalid" })

    const result = await state.handler?.({ input: { workspaceId: "ws-1" } })

    expect(result).toMatchObject({
      uploadMethod: "dataManager",
      consent: { status: "invalid", adUserData: null, adPersonalization: null },
    })
    expect(state.output?.parse(result)).toMatchObject({
      consent: { status: "invalid" },
    })
  })

  test("output schema strips credentials even if the service leaks them", async () => {
    const { googleAdsIntegrationResource } = await import(
      "@/features/integration-google-ads/schema/integration"
    )
    const leaky = {
      ...safeSetup,
      consent: {
        status: "absent",
        adUserData: notProvidedView,
        adPersonalization: notProvidedView,
      },
      auth: { accessToken: "ya29.SECRET", refreshToken: "REFRESH" },
      developerToken: "DEV-TOKEN",
      loginCustomerId: "9998887777",
      conversionActions: [
        { ...safeSetup.conversionActions[0], resourceName: "customers/1/x" },
      ],
    }

    const parsed = googleAdsIntegrationResource.parse(leaky)
    const wire = JSON.stringify(parsed)

    expect(wire).not.toContain("SECRET")
    expect(wire).not.toContain("DEV-TOKEN")
    expect(wire).not.toContain("loginCustomerId")
    expect(wire).not.toContain("resourceName")
    expect(parsed).not.toHaveProperty("auth")
    expect(state.output).toBeDefined()
  })
})

const SESSION_PATH = "/workspaces/{workspaceId}/google-ads/connect-session"
const EVENTS_PATH = "/workspaces/{workspaceId}/google-ads/events"

const eventRow = (overrides: Record<string, unknown> = {}) => ({
  id: "900",
  workspaceId: "ws-1",
  status: "failed",
  failureStage: "delivery",
  processingStatus: null,
  error: "bad request",
  channel: "whatsapp",
  conversionActionId: "7788",
  conversionActionName: "Lead",
  uploadMethod: "dataManager",
  clickIdType: "gclid",
  clickId: "Cj0KCQiAFULLCLICKIDxyz9",
  occurredAt: new Date("2026-10-01T00:00:00Z"),
  sentAt: null,
  value: "12.50",
  currency: "USD",
  claimToken: "CLAIM-SECRET",
  requestId: "REQ-SECRET",
  transactionId: "gads-1-abc",
  attempt: 3,
  ...overrides,
})

describe("googleAdsAPI.getInFlightConnectSession", () => {
  const route = routes[SESSION_PATH] as Captured

  beforeEach(() => {
    mocks.assertWorkspaceSuperAdmin.mockReset()
    mocks.findLatestInFlightByProvider.mockReset()
  })

  test("is membership-gated and additionally requires super admin", async () => {
    expect(route.middleware).toBe(workspaceAuthorizedMidddleware)
    expect(route.mapper?.({ workspaceId: "ws-1" })).toBe("ws-1")
    mocks.findLatestInFlightByProvider.mockResolvedValueOnce(undefined)

    await route.handler?.({ input: { workspaceId: "ws-1" } })

    expect(mocks.assertWorkspaceSuperAdmin).toHaveBeenCalledWith("ws-1")
  })

  test("does not read the session when the caller is not a super admin", async () => {
    mocks.assertWorkspaceSuperAdmin.mockRejectedValueOnce(new Error("denied"))

    await expect(
      route.handler?.({ input: { workspaceId: "ws-1" } }),
    ).rejects.toThrow("denied")
    expect(mocks.findLatestInFlightByProvider).not.toHaveBeenCalled()
  })

  test("queries googleAds for this workspace and returns id and status only", async () => {
    mocks.findLatestInFlightByProvider.mockResolvedValueOnce({
      id: "55",
      status: "awaiting_selection",
      encryptedAuth: "CIPHERTEXT",
      stateNonceHash: "HASH",
    })

    const result = await route.handler?.({ input: { workspaceId: "ws-1" } })

    expect(mocks.findLatestInFlightByProvider).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      provider: "googleAds",
    })
    expect(result).toEqual({
      session: { id: "55", status: "awaiting_selection" },
    })
  })

  test("returns null when nothing is in flight", async () => {
    mocks.findLatestInFlightByProvider.mockResolvedValueOnce(undefined)

    await expect(
      route.handler?.({ input: { workspaceId: "ws-1" } }),
    ).resolves.toEqual({ session: null })
  })
})

describe("googleAdsAPI.listEvents", () => {
  const route = routes[EVENTS_PATH] as Captured
  const baseInput = { workspaceId: "ws-1", page: 1, perPage: 20 }

  beforeEach(() => {
    mocks.assertWorkspaceSuperAdmin.mockReset()
    mocks.listEvents.mockReset()
  })

  test("requires super admin before reading", async () => {
    mocks.assertWorkspaceSuperAdmin.mockRejectedValueOnce(new Error("denied"))

    await expect(route.handler?.({ input: baseInput })).rejects.toThrow(
      "denied",
    )
    expect(mocks.listEvents).not.toHaveBeenCalled()
  })

  test("clamps perPage to 100 before calling the service", async () => {
    mocks.listEvents.mockResolvedValueOnce({ rows: [], total: 0 })

    const result = await route.handler?.({
      input: { ...baseInput, perPage: 5000 },
    })

    expect(mocks.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", perPage: 100 }),
    )
    expect(result).toMatchObject({ perPage: 100, page: 1, total: 0 })
  })

  test("forwards the filters", async () => {
    mocks.listEvents.mockResolvedValueOnce({ rows: [], total: 0 })
    const since = new Date("2026-09-01T00:00:00Z")

    await route.handler?.({
      input: { ...baseInput, status: "failed", channel: "messenger", since },
    })

    expect(mocks.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        channel: "messenger",
        since,
      }),
    )
  })

  test("forwards the conversion action filter", async () => {
    mocks.listEvents.mockResolvedValueOnce({ rows: [], total: 0 })

    await route.handler?.({
      input: { ...baseInput, conversionActionId: "7788" },
    })

    expect(mocks.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        conversionActionId: "7788",
      }),
    )
  })

  test("the request schema accepts a numeric conversion action id and rejects anything else", () => {
    const parse = (conversionActionId: unknown) =>
      listGoogleAdsEventsRequest.safeParse({
        workspaceId: "1",
        conversionActionId,
      })

    expect(parse("7788").success).toBe(true)
    expect(parse(undefined).success).toBe(true)
    expect(parse("abc").success).toBe(false)
    expect(parse("77 88").success).toBe(false)
    expect(parse("").success).toBe(false)
  })

  test("returns the conversion action id on each event", async () => {
    mocks.listEvents.mockResolvedValueOnce({ rows: [eventRow()], total: 1 })

    const result = await route.handler?.({ input: baseInput })
    const parsed = route.output?.parse(result) as {
      data: Record<string, unknown>[]
    }

    expect(parsed.data[0]?.conversionActionId).toBe("7788")
  })

  test("redacts the transaction id, request id and click id embedded in the error", async () => {
    mocks.listEvents.mockResolvedValueOnce({
      rows: [
        eventRow({
          error:
            "rejected gads-1-abc (request REQ-SECRET) for click Cj0KCQiAFULLCLICKIDxyz9",
        }),
      ],
      total: 1,
    })

    const result = await route.handler?.({ input: baseInput })
    const wire = JSON.stringify(route.output?.parse(result))

    expect(wire).toContain(
      "rejected [redacted] (request [redacted]) for click [redacted]",
    )
    expect(wire).not.toContain("gads-1-abc")
    expect(wire).not.toContain("REQ-SECRET")
    expect(wire).not.toContain("Cj0KCQiAFULLCLICKIDxyz9")
  })

  test("masks the click id and exposes no delivery internals", async () => {
    mocks.listEvents.mockResolvedValueOnce({ rows: [eventRow()], total: 1 })

    const result = (await route.handler?.({ input: baseInput })) as {
      data: Record<string, unknown>[]
    }
    const wire = JSON.stringify(route.output?.parse(result))

    expect(result.data[0]?.maskedClickId).toBe("Cj0K…xyz9")
    expect(wire).not.toContain("Cj0KCQiAFULLCLICKIDxyz9")
    expect(wire).not.toContain("CLAIM-SECRET")
    expect(wire).not.toContain("REQ-SECRET")
    expect(wire).not.toContain("gads-1-abc")
    expect(wire).not.toContain("claimToken")
    expect(wire).not.toContain("requestId")
  })

  test("exposes the options snapshot and strips unknown keys", async () => {
    mocks.listEvents.mockResolvedValueOnce({
      rows: [
        eventRow({
          status: "processed",
          failureStage: null,
          options: {
            version: 1,
            identity: {
              version: 1,
              configuredPolicy: "id",
              effectivePolicy: "id",
              keySource: "explicit",
              id: "A-1042",
            },
            timeSource: "provided",
            consent: {
              adUserData: { status: "granted", source: "fixed" },
              adPersonalization: { status: null, source: "notProvided" },
            },
          },
        }),
      ],
      total: 1,
    })

    const result = await route.handler?.({ input: baseInput })
    const parsed = route.output?.parse(result) as {
      data: Record<string, unknown>[]
    }

    expect(parsed.data[0]).toMatchObject({
      identity: { mode: "id", id: "A-1042" },
      conversionTimeProvided: true,
      consentSnapshot: {
        delivery: "sent",
        adUserData: "granted",
        adPersonalization: "notProvided",
      },
    })
    expect(parsed.data[0]).not.toHaveProperty("options")
    expect(
      route.output?.parse({
        ...(result as object),
        data: [
          {
            ...(parsed.data[0] as object),
            identity: { mode: "id", id: "x", extra: 1 },
          },
        ],
      }),
    ).toMatchObject({ data: [{ identity: { mode: "id", id: "x" } }] })
    expect(JSON.stringify(parsed)).not.toContain("extra")
  })

  test("a row without options has null identity and consent snapshot", async () => {
    mocks.listEvents.mockResolvedValueOnce({
      rows: [eventRow({ options: null })],
      total: 1,
    })

    const result = (await route.handler?.({ input: baseInput })) as {
      data: Record<string, unknown>[]
    }

    expect(result.data[0]).toMatchObject({
      identity: null,
      conversionTimeProvided: false,
      consentSnapshot: null,
    })
  })

  test("redacts the row's own click id out of a stored error message", async () => {
    mocks.listEvents.mockResolvedValueOnce({
      rows: [
        eventRow({ error: "invalid click Cj0KCQiAFULLCLICKIDxyz9 given" }),
      ],
      total: 1,
    })

    const result = (await route.handler?.({ input: baseInput })) as {
      data: { error: string }[]
    }

    expect(result.data[0]?.error).toBe("invalid click [redacted] given")
  })
})
