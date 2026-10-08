import type {
  GoogleAdsConversionActionCacheEntry,
  GoogleAdsSetupError,
  GoogleAdsUploadMethod,
} from "@chatbotx.io/database/partials"
import {
  type GoogleAdsAuthValue,
  uploadMethodOf,
} from "@chatbotx.io/integration-google-ads"
import type { GoogleAdsReadiness, GoogleAdsSetup } from "./service"

/** The transport a connection's new events use (`auth.metadata`, pinned at connect time; absent = Data Manager). */
const uploadMethodOfIntegration = (
  integration: Pick<GoogleAdsSetup["integration"], "auth">,
): GoogleAdsUploadMethod =>
  uploadMethodOf(integration.auth as GoogleAdsAuthValue)

export type PublicGoogleAdsConversionAction = Pick<
  GoogleAdsConversionActionCacheEntry,
  "id" | "name" | "category" | "status" | "countingType"
> & {
  /** `null` for entries cached before the attribution model was read. */
  attributionModel: string | null
}

/**
 * Credential-free view of the workspace's Google Ads setup, safe for any
 * workspace member (flow and trigger editors). It is built field by field so
 * `auth`, the login customer and anything else added to the row later never
 * leak by accident.
 */
export type PublicGoogleAdsSetup =
  | {
      connected: false
      readiness: null
      customerId: null
      descriptiveName: null
      currencyCode: null
      uploadMethod: null
      acceptedCustomerDataTerms: null
      setupError: null
      conversionActions: PublicGoogleAdsConversionAction[]
      conversionActionsSyncedAt: null
    }
  | {
      connected: true
      readiness: GoogleAdsReadiness
      customerId: string
      descriptiveName: string | null
      currencyCode: string | null
      /** The transport this connection's new events use; `auth` itself never leaves. */
      uploadMethod: GoogleAdsUploadMethod
      /** Whether the account accepted the customer data terms; null when unknown. */
      acceptedCustomerDataTerms: boolean | null
      setupError: GoogleAdsSetupError | null
      conversionActions: PublicGoogleAdsConversionAction[]
      conversionActionsSyncedAt: Date | null
    }

export const toPublicGoogleAdsSetup = (
  setup: GoogleAdsSetup | null,
): PublicGoogleAdsSetup => {
  if (!setup) {
    return {
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
    }
  }
  const { integration, readiness } = setup
  return {
    connected: true,
    readiness,
    customerId: integration.customerId,
    descriptiveName: integration.descriptiveName,
    currencyCode: integration.currencyCode,
    uploadMethod: uploadMethodOfIntegration(integration),
    acceptedCustomerDataTerms: integration.acceptedCustomerDataTerms,
    setupError: integration.setupError,
    conversionActions: (integration.conversionActions ?? []).map(
      ({ id, name, category, status, countingType, attributionModel }) => ({
        id,
        name,
        category,
        status,
        countingType,
        attributionModel: attributionModel ?? null,
      }),
    ),
    conversionActionsSyncedAt: integration.conversionActionsSyncedAt,
  }
}
