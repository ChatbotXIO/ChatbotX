import type {
  GoogleAdsConversionActionCacheEntry,
  GoogleAdsSetupError,
} from "@chatbotx.io/database/partials"
import {
  connectionRepository,
  integrationGoogleAdsRepository,
} from "@chatbotx.io/database/repositories"
import type {
  ConnectionModel,
  IntegrationGoogleAdsModel,
} from "@chatbotx.io/database/types"
import {
  type GoogleAdsAuthValue,
  GoogleAdsException,
  hasRequiredScopes,
  integration as integrationGoogleAds,
  NOT_ALLOWLISTED_REASON,
  sanitizeGoogleAdsError,
  uploadMethodOf,
} from "@chatbotx.io/integration-google-ads"
import { AuthException, AuthRefreshException } from "@chatbotx.io/sdk"
import { BaseService } from "../base.service"
import { isActiveConnectionStatus } from "../connection/state"
import {
  consentForTransport,
  consentTemplatesOf,
  type GoogleAdsConsentForTransport,
  toConsentInput,
} from "../google-ads/consent"
import { resolveLoginAccountId } from "../google-ads/login-account"
import { resolveCredentialOwnerIdForWorkspace } from "../google-ads/owner"
import { googleAdsSettingsService } from "../google-ads-settings/service"
import { buildContext } from "../integration-context/build-context"
import { logger } from "../logger"
import { platformCredentialService } from "../platform-credential/service"
import {
  type PublicGoogleAdsSetup,
  toPublicGoogleAdsSetup,
} from "./public-setup"

export type GoogleAdsReadiness =
  /** Connected, conversion customer resolved, actions synced: conversions can be sent. */
  | "ready"
  /** The Google grant is revoked or expired: the user must reconnect. */
  | "needs_reauth"
  /** Connected but setup (conversion customer / actions) is not complete. */
  | "setup_incomplete"

/** What Google itself reports for the actions this workspace syncs. */
export type GoogleAdsConversionReportRow = {
  conversionActionId: string
  name: string
  conversions: number
}
export type GoogleAdsConversionReport =
  | { status: "unavailable" }
  | { status: "ok"; total: number; byAction: GoogleAdsConversionReportRow[] }

export type GoogleAdsSetup = {
  integration: IntegrationGoogleAdsModel
  connection: ConnectionModel | undefined
  readiness: GoogleAdsReadiness
}

/**
 * The developer token is optional (Google ignores it since 2026-09), so an
 * absent token is still `available`; only a missing credential is not.
 */
export type DeveloperTokenResult =
  | { kind: "available"; developerToken: string | undefined }
  | { kind: "credentialMissing" }

/** Stable failure codes of a `validateIngest` check; the UI maps each to a translated message. */
export type ValidateIngestFailureCode =
  | "accountNotReady"
  | "needsReauth"
  | "legacyUploadNotAllowed"
  | "consentInvalid"
  | "rejected"

export type ValidateConsentValue = "granted" | "denied" | "omitted"

/** What the test upload carried per setting; the dialog renders only this. */
export type ValidateConsentSummary = {
  adUserData: ValidateConsentValue
  adPersonalization: ValidateConsentValue | "notSentLegacy"
}

/**
 * `detail` is a sanitized provider message (never the click id), set for
 * `rejected` only. `variableSkipped`: a consent setting reads a contact field,
 * which a test has no contact for, so it was left out. `withheldAdPersonalization`
 * is the fixed value the legacy method cannot send (set with `notSentLegacy`).
 */
export type ValidateIngestResult =
  | {
      ok: true
      consentSummary: ValidateConsentSummary
      variableSkipped: boolean
      withheldAdPersonalization?: "granted" | "denied"
    }
  | { ok: false; code: ValidateIngestFailureCode; detail?: string }

/** HTTP statuses meaning "this user cannot see that customer / that customer does not exist". */
const INACCESSIBLE_STATUSES: ReadonlySet<number> = new Set([403, 404])

const TRANSIENT_DETAIL = "Google is temporarily unavailable, try again later"

const toCacheEntry = (action: {
  id: string
  resourceName: string
  name: string
  category: string
  status: string
  countingType: string
  clickThroughLookbackWindowDays: number | null
  attributionModel?: string | null
}): GoogleAdsConversionActionCacheEntry => ({ ...action })

const deriveReadiness = (
  integration: IntegrationGoogleAdsModel,
  connection: ConnectionModel | undefined,
): GoogleAdsReadiness => {
  if (!(connection && isActiveConnectionStatus(connection.status))) {
    return "needs_reauth"
  }
  return integration.conversionCustomerId &&
    integration.conversionActionsSyncedAt
    ? "ready"
    : "setup_incomplete"
}

const toConsentSummary = ({
  sent,
  withheld,
}: GoogleAdsConsentForTransport): ValidateConsentSummary => ({
  adUserData: sent.adUserData ?? "omitted",
  adPersonalization:
    sent.adPersonalization ??
    (withheld.adPersonalization ? "notSentLegacy" : "omitted"),
})

const toSetupError = (error: unknown): GoogleAdsSetupError =>
  error instanceof GoogleAdsException &&
  INACCESSIBLE_STATUSES.has(error.httpStatusCode)
    ? "conversion_customer_inaccessible"
    : "sync_failed"

export class IntegrationGoogleAdsService extends BaseService {
  /** The workspace's Google Ads account, its connection and whether conversions can be sent. */
  async getSetup(workspaceId: string): Promise<GoogleAdsSetup | null> {
    const integration = await integrationGoogleAdsRepository.findByWorkspaceId({
      workspaceId,
    })
    if (!integration) {
      return null
    }
    const connection = await connectionRepository.findByIntegrationId({
      integrationId: integration.integrationId,
    })
    return {
      integration,
      connection,
      readiness: deriveReadiness(integration, connection),
    }
  }

  /** Credential-free setup view for any workspace member (flow / trigger editors). */
  async getPublicSetup(workspaceId: string): Promise<PublicGoogleAdsSetup> {
    return toPublicGoogleAdsSetup(await this.getSetup(workspaceId))
  }

  /**
   * The optional developer token from the owner's platform `googleAds`
   * credential (its own OAuth app — separate from `google`), sent on Google Ads
   * API calls (setup, sync, validation) only when present.
   */
  async resolveDeveloperToken(
    workspaceId: string,
  ): Promise<DeveloperTokenResult> {
    const credential = await platformCredentialService.resolveForOwner({
      ownerId: await resolveCredentialOwnerIdForWorkspace(workspaceId),
      type: "googleAds",
      strict: true,
    })
    if (!credential) {
      return { kind: "credentialMissing" }
    }
    return {
      kind: "available",
      developerToken: credential.config.developerToken || undefined,
    }
  }

  private async optionalDeveloperToken(
    workspaceId: string,
  ): Promise<string | undefined> {
    const token = await this.resolveDeveloperToken(workspaceId)
    return token.kind === "available" ? token.developerToken : undefined
  }

  /**
   * Whether connecting Google Ads can work for this workspace at all: the
   * owner's `googleAds` credential has a client id and client secret (the
   * developer token is optional).
   */
  async isConfigured(workspaceId: string): Promise<boolean> {
    const credential = await platformCredentialService.resolveForOwner({
      ownerId: await resolveCredentialOwnerIdForWorkspace(workspaceId),
      type: "googleAds",
      strict: true,
    })
    const config = credential?.config
    return Boolean(config?.clientId && config.clientSecret)
  }

  /**
   * (Re)resolves the conversion customer and re-reads its offline-import
   * conversion actions. Called after the user picks an account, on demand, and
   * daily. Never throws a raw provider error: every failure lands in
   * `setupError` as a stable code.
   */
  async refreshSetup(workspaceId: string): Promise<GoogleAdsSetup | null> {
    const setup = await this.getSetup(workspaceId)
    if (!setup) {
      return null
    }
    const { integration } = setup
    const token = await this.resolveDeveloperToken(workspaceId)
    if (token.kind === "credentialMissing") {
      return await this.recordSetupError(
        workspaceId,
        integration,
        "sync_failed",
      )
    }

    try {
      const ctx = await this.buildActionContext(workspaceId, integration)
      const customer = await integrationGoogleAds.runAction(
        "resolveConversionCustomer",
        { ctx, props: { developerToken: token.developerToken } },
      )
      const conversionCustomerId = customer.conversionCustomerId ?? customer.id
      const actions = await integrationGoogleAds.runAction(
        "listConversionActions",
        {
          ctx,
          props: {
            developerToken: token.developerToken,
            conversionCustomerId,
          },
        },
      )
      await integrationGoogleAdsRepository.updateSetup({
        id: integration.id,
        workspaceId,
        values: {
          conversionCustomerId,
          acceptedCustomerDataTerms: customer.acceptedCustomerDataTerms,
          conversionActions: actions.map(toCacheEntry),
          conversionActionsSyncedAt: new Date(),
          setupError:
            customer.acceptedCustomerDataTerms === false
              ? "customer_data_terms_not_accepted"
              : null,
          setupErrorAt:
            customer.acceptedCustomerDataTerms === false ? new Date() : null,
        },
      })
    } catch (error) {
      return await this.recordSetupError(
        workspaceId,
        integration,
        toSetupError(error),
      )
    }
    return await this.getSetup(workspaceId)
  }

  /**
   * Conversions Google itself reports for the conversion actions this workspace
   * syncs, over the given days (YYYY-MM-DD, account timezone). Read-only and
   * best effort: any failure answers `unavailable` so the dashboard still renders
   * its own numbers.
   */
  async getConversionReport(
    workspaceId: string,
    range: { from: string; to: string },
  ): Promise<GoogleAdsConversionReport> {
    const setup = await this.getSetup(workspaceId)
    const conversionCustomerId = setup?.integration.conversionCustomerId
    if (!(setup && conversionCustomerId && setup.readiness === "ready")) {
      return { status: "unavailable" }
    }
    const token = await this.resolveDeveloperToken(workspaceId)
    if (token.kind === "credentialMissing") {
      return { status: "unavailable" }
    }
    try {
      const ctx = await this.buildActionContext(workspaceId, setup.integration)
      const rows = await integrationGoogleAds.runAction("getConversionReport", {
        ctx,
        props: {
          developerToken: token.developerToken,
          conversionCustomerId,
          from: range.from,
          to: range.to,
        },
      })
      const synced = new Set(
        (setup.integration.conversionActions ?? []).map((action) => action.id),
      )
      const byAction = new Map<string, GoogleAdsConversionReportRow>()
      for (const row of rows) {
        if (!synced.has(row.conversionActionId)) {
          continue
        }
        const current = byAction.get(row.conversionActionId)
        byAction.set(row.conversionActionId, {
          conversionActionId: row.conversionActionId,
          name: current?.name ?? row.name,
          conversions: (current?.conversions ?? 0) + row.conversions,
        })
      }
      const list = [...byAction.values()]
      return {
        status: "ok",
        total: list.reduce((sum, row) => sum + row.conversions, 0),
        byAction: list,
      }
    } catch (error) {
      logger.warn({ err: error, workspaceId }, "Google Ads report unavailable")
      return { status: "unavailable" }
    }
  }

  /**
   * Checks a click against Google without recording a conversion
   * (`validateOnly`). A configuration/request check, not proof the conversion
   * will process — Data Manager processes asynchronously.
   */
  async validateIngest(input: {
    workspaceId: string
    conversionActionId: string
    clickIdType: "gclid" | "gbraid"
    clickId: string
  }): Promise<ValidateIngestResult> {
    const setup = await this.getSetup(input.workspaceId)
    const conversionCustomerId = setup?.integration.conversionCustomerId
    if (!(setup && conversionCustomerId && setup.readiness === "ready")) {
      return { ok: false, code: "accountNotReady" }
    }
    // The grant must still cover the connection's method (the user may have
    // unticked a scope); the fix is the same as for a revoked grant.
    if (!hasRequiredScopes(setup.integration.auth as GoogleAdsAuthValue)) {
      return { ok: false, code: "needsReauth" }
    }
    const stored = await googleAdsSettingsService.getConsent(input.workspaceId)
    if (stored.status === "invalid") {
      return { ok: false, code: "consentInvalid" }
    }
    const uploadMethod = uploadMethodOf(
      setup.integration.auth as GoogleAdsAuthValue,
    )
    // Fixed sources only: a variable one has no contact to resolve against, so
    // it resolves to "omitted" exactly as an empty contact field would.
    const resolved = toConsentInput(stored.consent, {})
    if (!resolved.ok) {
      return { ok: false, code: "consentInvalid" }
    }
    const transport = consentForTransport(resolved.consent, uploadMethod)
    try {
      const ctx = await this.buildActionContext(
        input.workspaceId,
        setup.integration,
      )
      const outcome = await integrationGoogleAds.runAction("ingestEvent", {
        ctx,
        props: {
          uploadMethod,
          developerToken:
            uploadMethod === "legacy"
              ? await this.optionalDeveloperToken(input.workspaceId)
              : undefined,
          loginAccountId: resolveLoginAccountId({
            customerId: setup.integration.customerId,
            loginCustomerId: setup.integration.loginCustomerId,
            conversionCustomerId,
          }),
          operatingAccountId: conversionCustomerId,
          conversionActionId: input.conversionActionId,
          validateOnly: true,
          event: {
            transactionId: `validate-${Date.now()}`,
            eventTimestamp: new Date(),
            clickIdType: input.clickIdType,
            clickId: input.clickId,
            consent: transport.sent,
          },
        },
      })
      if (outcome.kind === "retry") {
        return { ok: false, code: "rejected", detail: TRANSIENT_DETAIL }
      }
      return {
        ok: true,
        consentSummary: toConsentSummary(transport),
        variableSkipped:
          Object.keys(consentTemplatesOf(stored.consent)).length > 0,
        withheldAdPersonalization: transport.withheld.adPersonalization,
      }
    } catch (error) {
      if (
        error instanceof GoogleAdsException &&
        error.reason === NOT_ALLOWLISTED_REASON
      ) {
        return { ok: false, code: "legacyUploadNotAllowed" }
      }
      if (
        error instanceof AuthException ||
        error instanceof AuthRefreshException
      ) {
        return { ok: false, code: "needsReauth" }
      }
      return {
        ok: false,
        code: "rejected",
        detail: sanitizeGoogleAdsError(error, { secrets: [input.clickId] })
          .message,
      }
    }
  }

  /** Platform runbook: customer ids to register with Google (gTech allowlisting). */
  async listConnectedCustomerIds(): Promise<string[]> {
    return await integrationGoogleAdsRepository.listConnectedCustomerIds()
  }

  buildActionContext(
    workspaceId: string,
    integration: IntegrationGoogleAdsModel,
  ) {
    return buildContext({
      workspaceId,
      integrationType: "googleAds",
      integration: {
        ...integration,
        auth: integration.auth as GoogleAdsAuthValue,
      },
    })
  }

  private async recordSetupError(
    workspaceId: string,
    integration: IntegrationGoogleAdsModel,
    setupError: GoogleAdsSetupError,
  ): Promise<GoogleAdsSetup | null> {
    await integrationGoogleAdsRepository.updateSetup({
      id: integration.id,
      workspaceId,
      values: { setupError, setupErrorAt: new Date() },
    })
    return await this.getSetup(workspaceId)
  }
}

export const integrationGoogleAdsService = new IntegrationGoogleAdsService()
