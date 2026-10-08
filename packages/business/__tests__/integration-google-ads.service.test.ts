import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByWorkspaceId: vi.fn(),
  updateSetup: vi.fn(),
  listConnectedCustomerIds: vi.fn(),
  findByIntegrationId: vi.fn(),
  resolveForOwner: vi.fn(),
  resolveOwner: vi.fn(),
  buildContext: vi.fn(),
  runAction: vi.fn(),
  getConsent: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationGoogleAdsRepository: {
    findByWorkspaceId: mocks.findByWorkspaceId,
    updateSetup: mocks.updateSetup,
    listConnectedCustomerIds: mocks.listConnectedCustomerIds,
  },
  connectionRepository: { findByIntegrationId: mocks.findByIntegrationId },
}))
vi.mock("@chatbotx.io/integration-google-ads", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/integration-google-ads")>()
  return { ...actual, integration: { runAction: mocks.runAction } }
})
vi.mock("../src/platform-credential/service", () => ({
  platformCredentialService: { resolveForOwner: mocks.resolveForOwner },
}))
vi.mock("../src/google-ads/owner", () => ({
  resolveCredentialOwnerIdForWorkspace: mocks.resolveOwner,
}))
vi.mock("../src/integration-context/build-context", () => ({
  buildContext: mocks.buildContext,
}))
vi.mock("../src/google-ads-settings/service", () => ({
  googleAdsSettingsService: { getConsent: mocks.getConsent },
}))
vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {},
}))

const { GoogleAdsException } = await import(
  "@chatbotx.io/integration-google-ads"
)
const { AuthException, AuthRefreshException } = await import("@chatbotx.io/sdk")
const { integrationGoogleAdsService } = await import(
  "../src/integration-google-ads/service"
)

const NOT_PROVIDED = {
  adUserData: { type: "notProvided" },
  adPersonalization: { type: "notProvided" },
}

const integrationRow = (overrides: Record<string, unknown> = {}) => ({
  id: "gads-1",
  integrationId: "integ-1",
  customerId: "1112223333",
  loginCustomerId: null,
  conversionCustomerId: "7778889999",
  conversionActionsSyncedAt: new Date("2026-10-01T00:00:00Z"),
  auth: { accessToken: "ya29.SECRET", refreshToken: "REFRESH-SECRET" },
  ...overrides,
})

const googleError = (status: number) =>
  new GoogleAdsException({
    httpStatusCode: status,
    message: "nope",
    details: [],
  })

const rawAction = {
  id: "act-1",
  resourceName: "customers/1/conversionActions/1",
  name: "Lead",
  category: "SIGNUP",
  status: "ENABLED",
  countingType: "ONE_PER_CLICK",
  clickThroughLookbackWindowDays: 30,
}

describe("IntegrationGoogleAdsService", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.findByWorkspaceId.mockResolvedValue(integrationRow())
    mocks.findByIntegrationId.mockResolvedValue({ status: "connected" })
    mocks.resolveOwner.mockResolvedValue("owner-1")
    mocks.resolveForOwner.mockResolvedValue({
      config: {
        clientId: "client-id",
        clientSecret: "client-secret",
        developerToken: "dev-token",
      },
    })
    mocks.buildContext.mockResolvedValue({ ctx: true })
    mocks.updateSetup.mockResolvedValue(undefined)
    mocks.getConsent.mockResolvedValue({
      status: "absent",
      consent: NOT_PROVIDED,
    })
  })

  describe("getSetup", () => {
    test("returns null when the workspace has no Google Ads integration", async () => {
      mocks.findByWorkspaceId.mockResolvedValue(undefined)
      expect(await integrationGoogleAdsService.getSetup("ws-1")).toBeNull()
      expect(mocks.findByIntegrationId).not.toHaveBeenCalled()
    })

    test("is ready for an active connection with a synced conversion customer", async () => {
      const setup = await integrationGoogleAdsService.getSetup("ws-1")
      expect(setup?.readiness).toBe("ready")
      expect(mocks.findByIntegrationId).toHaveBeenCalledWith({
        integrationId: "integ-1",
      })
    })

    test("a degraded connection still counts as usable", async () => {
      mocks.findByIntegrationId.mockResolvedValue({ status: "degraded" })
      expect(
        (await integrationGoogleAdsService.getSetup("ws-1"))?.readiness,
      ).toBe("ready")
    })

    test.each([
      "needs_reauth",
      "paused",
      "disconnected",
    ])("needs_reauth for a %s connection", async (status) => {
      mocks.findByIntegrationId.mockResolvedValue({ status })
      expect(
        (await integrationGoogleAdsService.getSetup("ws-1"))?.readiness,
      ).toBe("needs_reauth")
    })

    test("needs_reauth when there is no connection row", async () => {
      mocks.findByIntegrationId.mockResolvedValue(undefined)
      expect(
        (await integrationGoogleAdsService.getSetup("ws-1"))?.readiness,
      ).toBe("needs_reauth")
    })

    test("setup_incomplete without a conversion customer", async () => {
      mocks.findByWorkspaceId.mockResolvedValue(
        integrationRow({ conversionCustomerId: null }),
      )
      expect(
        (await integrationGoogleAdsService.getSetup("ws-1"))?.readiness,
      ).toBe("setup_incomplete")
    })

    test("setup_incomplete before the first conversion action sync", async () => {
      mocks.findByWorkspaceId.mockResolvedValue(
        integrationRow({ conversionActionsSyncedAt: null }),
      )
      expect(
        (await integrationGoogleAdsService.getSetup("ws-1"))?.readiness,
      ).toBe("setup_incomplete")
    })
  })

  describe("resolveDeveloperToken", () => {
    test("returns the owner's platform googleAds developer token", async () => {
      expect(
        await integrationGoogleAdsService.resolveDeveloperToken("ws-1"),
      ).toEqual({ kind: "available", developerToken: "dev-token" })
      expect(mocks.resolveOwner).toHaveBeenCalledWith("ws-1")
      expect(mocks.resolveForOwner).toHaveBeenCalledWith({
        ownerId: "owner-1",
        type: "googleAds",
        strict: true,
      })
    })

    test("propagates a credential lookup failure instead of reporting missing", async () => {
      const failure = new Error("db down")
      mocks.resolveForOwner.mockRejectedValue(failure)
      await expect(
        integrationGoogleAdsService.resolveDeveloperToken("ws-1"),
      ).rejects.toBe(failure)
    })

    test("reports a missing credential, not a missing token", async () => {
      mocks.resolveForOwner.mockResolvedValue(undefined)
      expect(
        await integrationGoogleAdsService.resolveDeveloperToken("ws-1"),
      ).toEqual({ kind: "credentialMissing" })
    })

    test.each([
      ["no token configured", { config: { clientId: "c", clientSecret: "s" } }],
      [
        "an empty token",
        { config: { clientId: "c", clientSecret: "s", developerToken: "" } },
      ],
    ])("an absent token is available without one (%s)", async (_n, credential) => {
      mocks.resolveForOwner.mockResolvedValue(credential)
      expect(
        await integrationGoogleAdsService.resolveDeveloperToken("ws-1"),
      ).toEqual({ kind: "available", developerToken: undefined })
    })

    test("isConfigured needs client id and client secret only", async () => {
      expect(await integrationGoogleAdsService.isConfigured("ws-1")).toBe(true)
      mocks.resolveForOwner.mockResolvedValue({
        config: { clientId: "client-id", clientSecret: "client-secret" },
      })
      expect(await integrationGoogleAdsService.isConfigured("ws-1")).toBe(true)
      mocks.resolveForOwner.mockResolvedValue(undefined)
      expect(await integrationGoogleAdsService.isConfigured("ws-1")).toBe(false)
      for (const missing of ["clientId", "clientSecret"]) {
        mocks.resolveForOwner.mockResolvedValue({
          config: {
            clientId: "client-id",
            clientSecret: "client-secret",
            developerToken: "dev-token",
            [missing]: "",
          },
        })
        expect(await integrationGoogleAdsService.isConfigured("ws-1")).toBe(
          false,
        )
      }
      expect(mocks.resolveForOwner).toHaveBeenLastCalledWith({
        ownerId: "owner-1",
        type: "googleAds",
        strict: true,
      })
    })
  })

  describe("refreshSetup", () => {
    const stubActions = (
      acceptedCustomerDataTerms: boolean | undefined = true,
    ) => {
      mocks.runAction.mockImplementation(async (name: string) =>
        name === "resolveConversionCustomer"
          ? {
              id: "1112223333",
              conversionCustomerId: "5556667777",
              acceptedCustomerDataTerms,
            }
          : [rawAction],
      )
    }

    test("returns null when there is no integration", async () => {
      mocks.findByWorkspaceId.mockResolvedValue(undefined)
      expect(await integrationGoogleAdsService.refreshSetup("ws-1")).toBeNull()
      expect(mocks.updateSetup).not.toHaveBeenCalled()
    })

    test("stores the resolved customer, synced actions and clears the setup error", async () => {
      stubActions(true)
      await integrationGoogleAdsService.refreshSetup("ws-1")

      expect(mocks.runAction).toHaveBeenCalledWith(
        "resolveConversionCustomer",
        {
          ctx: { ctx: true },
          props: { developerToken: "dev-token" },
        },
      )
      expect(mocks.runAction).toHaveBeenCalledWith("listConversionActions", {
        ctx: { ctx: true },
        props: {
          developerToken: "dev-token",
          conversionCustomerId: "5556667777",
        },
      })
      expect(mocks.updateSetup).toHaveBeenCalledWith({
        id: "gads-1",
        workspaceId: "ws-1",
        values: {
          conversionCustomerId: "5556667777",
          acceptedCustomerDataTerms: true,
          conversionActions: [rawAction],
          conversionActionsSyncedAt: expect.any(Date),
          setupError: null,
          setupErrorAt: null,
        },
      })
    })

    test("stores the attribution model so external actions can be refused", async () => {
      const external = { ...rawAction, attributionModel: "EXTERNAL" }
      mocks.runAction.mockImplementation(async (name: string) =>
        name === "resolveConversionCustomer"
          ? { id: "1112223333", acceptedCustomerDataTerms: true }
          : [external],
      )
      await integrationGoogleAdsService.refreshSetup("ws-1")
      expect(
        mocks.updateSetup.mock.calls[0][0].values.conversionActions,
      ).toEqual([external])
    })

    test("falls back to the customer id when there is no manager-linked conversion customer", async () => {
      mocks.runAction.mockImplementation(async (name: string) =>
        name === "resolveConversionCustomer"
          ? { id: "1112223333", acceptedCustomerDataTerms: true }
          : [],
      )
      await integrationGoogleAdsService.refreshSetup("ws-1")
      expect(
        mocks.updateSetup.mock.calls[0][0].values.conversionCustomerId,
      ).toBe("1112223333")
    })

    test("flags customer_data_terms_not_accepted but still stores the actions", async () => {
      stubActions(false)
      await integrationGoogleAdsService.refreshSetup("ws-1")
      expect(mocks.updateSetup.mock.calls[0][0].values).toMatchObject({
        acceptedCustomerDataTerms: false,
        setupError: "customer_data_terms_not_accepted",
        setupErrorAt: expect.any(Date),
        conversionActions: [rawAction],
      })
    })

    test("sync_failed (not a token error) when the platform credential is absent", async () => {
      mocks.resolveForOwner.mockResolvedValue(undefined)
      await integrationGoogleAdsService.refreshSetup("ws-1")
      expect(mocks.runAction).not.toHaveBeenCalled()
      expect(mocks.updateSetup).toHaveBeenCalledWith({
        id: "gads-1",
        workspaceId: "ws-1",
        values: {
          setupError: "sync_failed",
          setupErrorAt: expect.any(Date),
        },
      })
    })

    test("runs the setup calls without a developer token", async () => {
      mocks.resolveForOwner.mockResolvedValue({
        config: { clientId: "client-id", clientSecret: "client-secret" },
      })
      stubActions(true)
      await integrationGoogleAdsService.refreshSetup("ws-1")

      expect(mocks.runAction).toHaveBeenCalledWith(
        "resolveConversionCustomer",
        { ctx: { ctx: true }, props: { developerToken: undefined } },
      )
      expect(mocks.updateSetup).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.objectContaining({ setupError: null }),
        }),
      )
    })

    test.each([
      403, 404,
    ])("conversion_customer_inaccessible on HTTP %i", async (status) => {
      mocks.runAction.mockRejectedValue(googleError(status))
      await integrationGoogleAdsService.refreshSetup("ws-1")
      expect(mocks.updateSetup).toHaveBeenCalledWith({
        id: "gads-1",
        workspaceId: "ws-1",
        values: {
          setupError: "conversion_customer_inaccessible",
          setupErrorAt: expect.any(Date),
        },
      })
    })

    test.each([
      ["a 500 Google error", () => googleError(500)],
      ["a generic error", () => new Error("network")],
    ])("sync_failed on %s, without throwing", async (_n, makeError) => {
      mocks.runAction.mockRejectedValue(makeError())
      await expect(
        integrationGoogleAdsService.refreshSetup("ws-1"),
      ).resolves.not.toBeNull()
      expect(mocks.updateSetup.mock.calls[0][0].values.setupError).toBe(
        "sync_failed",
      )
    })

    test("a failing list step is recorded as a setup error too", async () => {
      mocks.runAction.mockImplementation((name: string) =>
        name === "resolveConversionCustomer"
          ? Promise.resolve({ id: "1", acceptedCustomerDataTerms: true })
          : Promise.reject(googleError(403)),
      )
      await integrationGoogleAdsService.refreshSetup("ws-1")
      expect(mocks.updateSetup).toHaveBeenCalledTimes(1)
      expect(mocks.updateSetup.mock.calls[0][0].values.setupError).toBe(
        "conversion_customer_inaccessible",
      )
    })
  })

  describe("validateIngest", () => {
    const input = {
      workspaceId: "ws-1",
      conversionActionId: "999",
      clickIdType: "gclid" as const,
      clickId: "GCLID-SECRET",
    }

    test("is not ready without a ready account", async () => {
      mocks.findByWorkspaceId.mockResolvedValue(undefined)
      expect(await integrationGoogleAdsService.validateIngest(input)).toEqual({
        ok: false,
        code: "accountNotReady",
      })
      mocks.findByWorkspaceId.mockResolvedValue(integrationRow())
      mocks.findByIntegrationId.mockResolvedValue({ status: "needs_reauth" })
      expect(await integrationGoogleAdsService.validateIngest(input)).toEqual({
        ok: false,
        code: "accountNotReady",
      })
      expect(mocks.runAction).not.toHaveBeenCalled()
    })

    test("asks to reconnect when the stored grant lacks a scope the method needs", async () => {
      mocks.findByWorkspaceId.mockResolvedValue(
        integrationRow({
          auth: {
            metadata: {
              scope: "https://www.googleapis.com/auth/adwords openid email",
            },
          },
        }),
      )
      expect(await integrationGoogleAdsService.validateIngest(input)).toEqual({
        ok: false,
        code: "needsReauth",
      })
      expect(mocks.runAction).not.toHaveBeenCalled()
    })

    test("a legacy connection with an adwords-only grant is validated", async () => {
      mocks.findByWorkspaceId.mockResolvedValue(
        integrationRow({
          auth: {
            metadata: {
              uploadMethod: "legacy",
              scope: "https://www.googleapis.com/auth/adwords openid email",
            },
          },
        }),
      )
      mocks.runAction.mockResolvedValue({ requestId: "r" })
      expect(
        await integrationGoogleAdsService.validateIngest(input),
      ).toMatchObject({
        ok: true,
      })
    })

    test("a legacy connection validates through the legacy transport with the owner's optional token", async () => {
      mocks.findByWorkspaceId.mockResolvedValue(
        integrationRow({ auth: { metadata: { uploadMethod: "legacy" } } }),
      )
      mocks.resolveOwner.mockResolvedValue("reseller-owner")
      mocks.resolveForOwner.mockResolvedValue({
        config: { clientId: "c", clientSecret: "s" },
      })
      mocks.runAction.mockResolvedValue({
        kind: "validated",
        fieldWarnings: [],
      })

      expect(
        await integrationGoogleAdsService.validateIngest(input),
      ).toMatchObject({
        ok: true,
      })

      expect(mocks.resolveOwner).toHaveBeenCalledWith("ws-1")
      expect(mocks.resolveForOwner).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: "reseller-owner" }),
      )
      const props = mocks.runAction.mock.calls[0]?.[1].props
      expect(props).toMatchObject({
        uploadMethod: "legacy",
        validateOnly: true,
      })
      expect(props.developerToken).toBeUndefined()
    })

    test("a Data Manager connection never resolves or sends a token", async () => {
      mocks.runAction.mockResolvedValue({ kind: "accepted", requestId: "r" })

      await integrationGoogleAdsService.validateIngest(input)

      expect(mocks.resolveForOwner).not.toHaveBeenCalled()
      expect(mocks.runAction.mock.calls[0]?.[1].props).toMatchObject({
        uploadMethod: "dataManager",
      })
    })

    test("CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE yields the stable legacyUploadNotAllowed code", async () => {
      mocks.runAction.mockRejectedValue(
        new GoogleAdsException({
          httpStatusCode: 400,
          reason: "CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE",
          message: "GCLID-SECRET not allowed",
          details: [],
        }),
      )

      expect(await integrationGoogleAdsService.validateIngest(input)).toEqual({
        ok: false,
        code: "legacyUploadNotAllowed",
      })
    })

    test("a transient legacy answer is reported as rejected with a fixed, click-free detail", async () => {
      mocks.runAction.mockResolvedValue({ kind: "retry", reason: "transient" })

      const result = await integrationGoogleAdsService.validateIngest(input)

      expect(result).toMatchObject({ ok: false, code: "rejected" })
      expect(JSON.stringify(result)).not.toContain("GCLID-SECRET")
    })

    describe("consent", () => {
      const stored = (
        adUserData: Record<string, unknown>,
        adPersonalization: Record<string, unknown> = { type: "notProvided" },
      ) =>
        mocks.getConsent.mockResolvedValue({
          status: "ok",
          consent: { adUserData, adPersonalization },
        })
      const legacy = () =>
        mocks.findByWorkspaceId.mockResolvedValue(
          integrationRow({ auth: { metadata: { uploadMethod: "legacy" } } }),
        )
      const sentConsent = () =>
        mocks.runAction.mock.calls[0]?.[1].props.event.consent

      beforeEach(() => {
        mocks.runAction.mockResolvedValue({ kind: "accepted", requestId: "r" })
      })

      test("nothing provided sends no consent and says so", async () => {
        const result = await integrationGoogleAdsService.validateIngest(input)

        expect(sentConsent()).toEqual({})
        expect(result).toEqual({
          ok: true,
          consentSummary: {
            adUserData: "omitted",
            adPersonalization: "omitted",
          },
          variableSkipped: false,
          withheldAdPersonalization: undefined,
        })
      })

      test.each([
        ["granted", "denied"],
        ["denied", "granted"],
      ] as const)("Data Manager includes fixed %s / %s", async (userData, personalization) => {
        stored({ type: userData }, { type: personalization })

        const result = await integrationGoogleAdsService.validateIngest(input)

        expect(sentConsent()).toEqual({
          adUserData: userData,
          adPersonalization: personalization,
        })
        expect(result).toMatchObject({
          ok: true,
          consentSummary: {
            adUserData: userData,
            adPersonalization: personalization,
          },
          variableSkipped: false,
        })
      })

      test("a variable source is omitted and flagged as skipped", async () => {
        stored({ type: "variable", template: "{{gdpr}}" }, { type: "denied" })

        const result = await integrationGoogleAdsService.validateIngest(input)

        expect(sentConsent()).toEqual({ adPersonalization: "denied" })
        expect(result).toMatchObject({
          ok: true,
          consentSummary: {
            adUserData: "omitted",
            adPersonalization: "denied",
          },
          variableSkipped: true,
        })
        expect(JSON.stringify(result)).not.toContain("gdpr")
      })

      test("legacy sends ad user data and reports a fixed ad personalization as not sent", async () => {
        legacy()
        mocks.runAction.mockResolvedValue({
          kind: "validated",
          fieldWarnings: [],
        })
        stored({ type: "granted" }, { type: "denied" })

        const result = await integrationGoogleAdsService.validateIngest(input)

        expect(sentConsent()).toEqual({ adUserData: "granted" })
        expect(result).toMatchObject({
          ok: true,
          consentSummary: {
            adUserData: "granted",
            adPersonalization: "notSentLegacy",
          },
          withheldAdPersonalization: "denied",
        })
      })

      test("legacy with an unanswered ad personalization is omitted, not 'not sent'", async () => {
        legacy()
        mocks.runAction.mockResolvedValue({
          kind: "validated",
          fieldWarnings: [],
        })
        stored({ type: "denied" })

        const result = await integrationGoogleAdsService.validateIngest(input)

        expect(result).toMatchObject({
          consentSummary: {
            adUserData: "denied",
            adPersonalization: "omitted",
          },
        })
      })

      test("an unreadable stored document is refused without calling Google", async () => {
        mocks.getConsent.mockResolvedValue({ status: "invalid" })

        expect(await integrationGoogleAdsService.validateIngest(input)).toEqual(
          {
            ok: false,
            code: "consentInvalid",
          },
        )
        expect(mocks.runAction).not.toHaveBeenCalled()
      })

      test("loads the consent of the requested workspace", async () => {
        await integrationGoogleAdsService.validateIngest(input)

        expect(mocks.getConsent).toHaveBeenCalledWith("ws-1")
      })
    })

    test("sends a validateOnly ingest and returns ok", async () => {
      mocks.runAction.mockResolvedValue({ requestId: "r" })
      expect(
        await integrationGoogleAdsService.validateIngest(input),
      ).toMatchObject({
        ok: true,
      })
      expect(mocks.runAction).toHaveBeenCalledWith("ingestEvent", {
        ctx: { ctx: true },
        props: expect.objectContaining({
          // Cross-account (actions owned by 7778889999), reached directly:
          // the login account must be able to write to the operating account.
          loginAccountId: "7778889999",
          operatingAccountId: "7778889999",
          conversionActionId: "999",
          validateOnly: true,
          event: expect.objectContaining({
            clickIdType: "gclid",
            clickId: "GCLID-SECRET",
          }),
        }),
      })
    })

    test("uses the login customer id when present", async () => {
      mocks.findByWorkspaceId.mockResolvedValue(
        integrationRow({ loginCustomerId: "4445556666" }),
      )
      mocks.runAction.mockResolvedValue({})
      await integrationGoogleAdsService.validateIngest(input)
      expect(mocks.runAction.mock.calls[0][1].props.loginAccountId).toBe(
        "4445556666",
      )
    })

    test.each([
      ["same account, direct", "1112223333", null, "1112223333"],
      ["same account, via manager", "1112223333", "4445556666", "4445556666"],
      ["cross-account, direct", "7778889999", null, "7778889999"],
      ["cross-account, via manager", "7778889999", "4445556666", "4445556666"],
    ])("login account for %s", async (_name, conversion, login, expected) => {
      mocks.findByWorkspaceId.mockResolvedValue(
        integrationRow({
          loginCustomerId: login,
          conversionCustomerId: conversion,
        }),
      )
      mocks.runAction.mockResolvedValue({})
      await integrationGoogleAdsService.validateIngest(input)
      const { props } = mocks.runAction.mock.calls[0][1]
      expect(props.loginAccountId).toBe(expected)
      expect(props.operatingAccountId).toBe(conversion)
    })

    test.each([
      ["AuthException", () => new AuthException("expired")],
      ["AuthRefreshException", () => new AuthRefreshException("revoked")],
    ])("%s maps to needs_reauth", async (_n, makeError) => {
      mocks.runAction.mockRejectedValue(makeError())
      expect(await integrationGoogleAdsService.validateIngest(input)).toEqual({
        ok: false,
        code: "needsReauth",
      })
    })

    test("returns a sanitized message that never contains the click id", async () => {
      mocks.runAction.mockRejectedValue(
        new Error("Invalid click GCLID-SECRET supplied"),
      )
      const result = await integrationGoogleAdsService.validateIngest(input)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("rejected")
        expect(result.detail).not.toContain("GCLID-SECRET")
        expect(result.detail).toContain("[redacted]")
      }
    })
  })

  test("listConnectedCustomerIds delegates to the repository", async () => {
    mocks.listConnectedCustomerIds.mockResolvedValue(["1", "2"])
    expect(
      await integrationGoogleAdsService.listConnectedCustomerIds(),
    ).toEqual(["1", "2"])
  })

  test("buildActionContext builds a googleAds context from the integration", async () => {
    const row = integrationRow()
    await integrationGoogleAdsService.buildActionContext("ws-1", row as never)
    expect(mocks.buildContext).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationType: "googleAds",
      integration: { ...row, auth: row.auth },
    })
  })
})
