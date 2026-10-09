import type { GoogleAdsSetup } from "@chatbotx.io/business"
import {
  DEFAULT_GOOGLE_ADS_UPLOAD_METHOD,
  type GoogleAdsSetupError,
  type GoogleAdsUploadMethod,
  googleAdsUploadMethodSchema,
} from "@chatbotx.io/database/partials"
import type { ConnectionStatus } from "@chatbotx.io/utils/connection"

export type GoogleAdsSettingsConversionAction = {
  id: string
  name: string
  category: string
  status: string
  countingType: string
  attributionModel: string | null
  lookbackDays: number | null
}

/**
 * Super-admin settings projection built field by field: `auth`, tokens and the
 * connection row never reach the client component props.
 */
export type GoogleAdsSettingsView = {
  customerId: string
  loginCustomerId: string | null
  descriptiveName: string | null
  currencyCode: string | null
  conversionCustomerId: string | null
  acceptedCustomerDataTerms: boolean | null
  setupError: GoogleAdsSetupError | null
  /** Normalized, non-secret: the transport this connection's new events use. */
  uploadMethod: GoogleAdsUploadMethod
  readiness: GoogleAdsSetup["readiness"]
  connectionStatus: ConnectionStatus
  conversionActions: GoogleAdsSettingsConversionAction[]
  conversionActionsSyncedAt: Date | null
}

/**
 * The only thing read from the satellite `auth`: the normalized method pinned
 * at connect time. Absent or unrecognised = Data Manager (pre-choice rows).
 */
const uploadMethodOfAuth = (auth: unknown): GoogleAdsUploadMethod => {
  const metadata =
    typeof auth === "object" && auth !== null && "metadata" in auth
      ? auth.metadata
      : undefined
  const method =
    typeof metadata === "object" &&
    metadata !== null &&
    "uploadMethod" in metadata
      ? metadata.uploadMethod
      : undefined
  const parsed = googleAdsUploadMethodSchema.safeParse(method)
  return parsed.success ? parsed.data : DEFAULT_GOOGLE_ADS_UPLOAD_METHOD
}

export const toGoogleAdsSettingsView = (
  setup: GoogleAdsSetup | null,
): GoogleAdsSettingsView | null => {
  if (!setup) {
    return null
  }
  const { integration, connection, readiness } = setup
  return {
    customerId: integration.customerId,
    loginCustomerId: integration.loginCustomerId,
    descriptiveName: integration.descriptiveName,
    currencyCode: integration.currencyCode,
    conversionCustomerId: integration.conversionCustomerId,
    acceptedCustomerDataTerms: integration.acceptedCustomerDataTerms,
    setupError: integration.setupError,
    uploadMethod: uploadMethodOfAuth(integration.auth),
    readiness,
    connectionStatus: connection?.status ?? "disconnected",
    conversionActions: (integration.conversionActions ?? []).map((action) => ({
      id: action.id,
      name: action.name,
      category: action.category,
      status: action.status,
      countingType: action.countingType,
      attributionModel: action.attributionModel ?? null,
      lookbackDays: action.clickThroughLookbackWindowDays,
    })),
    conversionActionsSyncedAt: integration.conversionActionsSyncedAt,
  }
}
