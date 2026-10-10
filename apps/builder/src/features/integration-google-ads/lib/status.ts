import type { ValidateIngestFailureCode } from "@chatbotx.io/business"
import type {
  GoogleAdsClickIdType,
  GoogleAdsEventStatus,
  GoogleAdsFailureStage,
  GoogleAdsProcessingStatus,
  GoogleAdsSetupError,
  GoogleAdsUploadMethod,
} from "@chatbotx.io/database/partials"
import type {
  ConnectErrorQueryCode,
  ConnectionStatus,
  ConnectSessionErrorCode,
} from "@chatbotx.io/utils/connection"
import { allInboxConfigs } from "@/features/inboxes/provider/inbox-hook"
import type { GoogleAdsEventResource } from "../schema/events"

/**
 * Exhaustive literal maps from every enum value to its i18n key (see the
 * "Dynamic translation keys" rule in the builder-ui-i18n skill): a new enum
 * member without a translation fails type-checking here.
 */
export const eventStatusLabelKey = {
  pending: "googleAds.events.status.pending",
  sending: "googleAds.events.status.sending",
  sent: "googleAds.events.status.sent",
  processed: "googleAds.events.status.processed",
  failed: "googleAds.events.status.failed",
  skipped_no_account: "googleAds.events.status.skippedNoAccount",
  skipped_expired: "googleAds.events.status.skippedExpired",
} as const satisfies Record<GoogleAdsEventStatus, string>

export const uploadMethodLabelKey = {
  dataManager: "googleAds.uploadMethods.dataManager",
  legacy: "googleAds.uploadMethods.legacy",
} as const satisfies Record<GoogleAdsUploadMethod, string>

export const processingStatusLabelKey = {
  processing: "googleAds.events.processing.processing",
  success: "googleAds.events.processing.success",
  partial_success: "googleAds.events.processing.partialSuccess",
  failed: "googleAds.events.processing.failed",
  unknown: "googleAds.events.processing.unknown",
  timed_out: "googleAds.events.processing.timedOut",
} as const satisfies Record<GoogleAdsProcessingStatus, string>

export const failureStageLabelKey = {
  delivery: "googleAds.events.stage.delivery",
  processing: "googleAds.events.stage.processing",
  timeout: "googleAds.events.stage.timeout",
} as const satisfies Record<GoogleAdsFailureStage, string>

/**
 * Channel names reuse the app-wide inbox label (brand names, not translated),
 * so a new Google Ads channel needs no Google-specific key.
 */
export const channelLabel = (channel: string): string =>
  allInboxConfigs[channel as keyof typeof allInboxConfigs]?.label ?? channel

export const clickIdTypeLabelKey = {
  gclid: "googleAds.validate.clickIdTypes.gclid",
  gbraid: "googleAds.validate.clickIdTypes.gbraid",
} as const satisfies Record<GoogleAdsClickIdType, string>

export const validateReasonLabelKey = {
  accountNotReady: "googleAds.validate.reasons.accountNotReady",
  needsReauth: "googleAds.validate.reasons.needsReauth",
  legacyUploadNotAllowed: "googleAds.validate.reasons.legacyUploadNotAllowed",
  consentInvalid: "googleAds.consent.invalidStored",
  rejected: "googleAds.validate.reasons.rejected",
} as const satisfies Record<ValidateIngestFailureCode, string>

export const connectionStatusLabelKey = {
  connected: "googleAds.status.connected",
  degraded: "googleAds.status.degraded",
  needs_reauth: "googleAds.status.needsReauth",
  paused: "googleAds.status.paused",
  disconnected: "googleAds.status.disconnected",
} as const satisfies Record<ConnectionStatus, string>

export const setupErrorKey = {
  conversion_customer_inaccessible:
    "googleAds.setup.errors.conversionCustomerInaccessible",
  customer_data_terms_not_accepted:
    "googleAds.setup.errors.customerDataTermsNotAccepted",
  sync_failed: "googleAds.setup.errors.syncFailed",
  developer_token_missing: "googleAds.setup.errors.developerTokenMissing",
} as const satisfies Record<GoogleAdsSetupError, string>

export const connectSessionErrorKey = {
  state_mismatch: "googleAds.picker.errors.stateMismatch",
  expired: "googleAds.picker.errors.expired",
  provider_denied: "googleAds.picker.errors.providerDenied",
  exchange_failed: "googleAds.picker.errors.exchangeFailed",
  provider_error: "googleAds.picker.errors.providerError",
  no_candidates: "googleAds.picker.errors.noCandidates",
  already_connected: "googleAds.picker.errors.alreadyConnected",
  quota_exceeded: "googleAds.picker.errors.quotaExceeded",
  trial_expired: "googleAds.picker.errors.trialExpired",
  internal_error: "googleAds.picker.errors.internalError",
} as const satisfies Record<ConnectSessionErrorCode, string>

/**
 * Every value the OAuth callback's `?connect_error=` may carry: the stored
 * session codes plus the transient and provider-specific causes that never
 * reach the (CHECK-constrained) session column.
 */
export const connectErrorKey = {
  ...connectSessionErrorKey,
  provider_unavailable: "googleAds.picker.errors.providerUnavailable",
  developer_token_missing: "googleAds.picker.errors.developerTokenMissing",
  developer_token_not_approved:
    "googleAds.picker.errors.developerTokenNotApproved",
  project_not_approved: "googleAds.picker.errors.projectNotApproved",
  permission_denied: "googleAds.picker.errors.permissionDenied",
  api_not_enabled: "googleAds.picker.errors.apiNotEnabled",
  credentials_invalid: "googleAds.picker.errors.credentialsInvalid",
  scope_missing: "googleAds.picker.errors.scopeMissing",
  legacy_upload_not_allowed: "googleAds.picker.errors.legacyUploadNotAllowed",
} as const satisfies Record<ConnectErrorQueryCode, string>

/** Semantic tone of a status badge; the badge also carries an icon and text, so colour is never the only signal. */
export type StatusTone = "success" | "info" | "warning" | "danger" | "muted"

export const eventStatusTone: Record<GoogleAdsEventStatus, StatusTone> = {
  pending: "info",
  sending: "info",
  sent: "success",
  processed: "success",
  failed: "danger",
  skipped_no_account: "muted",
  skipped_expired: "muted",
}

export const connectionStatusTone: Record<ConnectionStatus, StatusTone> = {
  connected: "success",
  degraded: "warning",
  needs_reauth: "warning",
  paused: "muted",
  disconnected: "muted",
}

type EventConsentSnapshot = NonNullable<
  GoogleAdsEventResource["consentSnapshot"]
>

export const eventConsentStatusLabelKey = {
  granted: "googleAds.events.consent.status.granted",
  denied: "googleAds.events.consent.status.denied",
  notProvided: "googleAds.events.consent.status.notProvided",
  notSupported: "googleAds.events.consent.status.notSupported",
} as const satisfies Record<EventConsentSnapshot["adUserData"], string>

/** `sent` is the normal case and has no label of its own. */
export const eventConsentDeliveryLabelKey = {
  toSend: "googleAds.events.consent.delivery.toSend",
  notSent: "googleAds.events.consent.delivery.notSent",
  unknown: "googleAds.events.consent.delivery.unknown",
} as const satisfies Record<
  Exclude<EventConsentSnapshot["delivery"], "sent">,
  string
>
