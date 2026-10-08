import { AuthException } from "@chatbotx.io/sdk"
import type { ConnectFailureCause } from "@chatbotx.io/utils/connection"
import { GoogleAdsException } from "../exception"
import { NOT_ALLOWLISTED_REASON } from "./upload-errors"

const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403

/** The Google user has no Google Ads account at all: reported as "no accounts", not as a fault. */
export type GoogleAdsConnectFailure = ConnectFailureCause | "no_ads_account"

const DEVELOPER_TOKEN_MISSING_REASONS: ReadonlySet<string> = new Set([
  "DEVELOPER_TOKEN_PARAMETER_MISSING",
])
const PERMISSION_DENIED_REASONS: ReadonlySet<string> = new Set([
  "USER_PERMISSION_DENIED",
  "CUSTOMER_NOT_ENABLED",
])
/** The Google Cloud project (not the user) lacks production API access. */
const PROJECT_NOT_APPROVED_REASON = "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION"
/** What API versions before v25 return for the same condition; ambiguous elsewhere, so only as an authorizationError. */
const LEGACY_PROJECT_NOT_APPROVED_REASON = "ACTION_NOT_PERMITTED"
const AUTHORIZATION_ERROR_CATEGORY = "authorizationError"
const API_NOT_ENABLED_REASONS: ReadonlySet<string> = new Set([
  "SERVICE_DISABLED",
  "API_NOT_ENABLED",
])
const CREDENTIAL_REASONS: ReadonlySet<string> = new Set([
  "OAUTH_TOKEN_INVALID",
  "OAUTH_TOKEN_EXPIRED",
  "OAUTH_TOKEN_REVOKED",
  "OAUTH_TOKEN_HEADER_INVALID",
  "CLIENT_CUSTOMER_ID_INVALID",
])
const NO_ADS_ACCOUNT_REASONS: ReadonlySet<string> = new Set(["NOT_ADS_USER"])

const API_DISABLED_MESSAGE_PATTERN =
  /has not been used in project|is disabled|api has not been (?:used|enabled)/i

/** The fixed, public English text per cause (never echoes Google's message, which may name the project). */
export const GOOGLE_ADS_FAILURE_MESSAGES: Record<ConnectFailureCause, string> =
  {
    developer_token_missing: "Google Ads developer token is not configured",
    developer_token_not_approved:
      "Google rejected the Google Ads developer token",
    project_not_approved:
      "The Google Cloud project is not approved for production Google Ads accounts",
    permission_denied:
      "The Google user does not have permission to access Google Ads accounts",
    api_not_enabled: "The Google Ads API is not enabled for this project",
    credentials_invalid: "Google Ads credentials were rejected",
    scope_missing:
      "Google Ads and Data Manager permissions were not both granted",
    legacy_upload_not_allowed:
      "Google does not allow the legacy upload API for this account: switch the credential to Data Manager and reconnect this workspace",
  }

const classifyGoogleAdsException = (
  error: GoogleAdsException,
): GoogleAdsConnectFailure | undefined => {
  const reason = error.reason ?? ""
  // Either envelope (HTTP error or partialFailureError); never assume a 403.
  if (reason === NOT_ALLOWLISTED_REASON) {
    return "legacy_upload_not_allowed"
  }
  if (NO_ADS_ACCOUNT_REASONS.has(reason)) {
    return "no_ads_account"
  }
  if (DEVELOPER_TOKEN_MISSING_REASONS.has(reason)) {
    return "developer_token_missing"
  }
  if (reason.startsWith("DEVELOPER_TOKEN")) {
    return "developer_token_not_approved"
  }
  if (
    reason === PROJECT_NOT_APPROVED_REASON ||
    (reason === LEGACY_PROJECT_NOT_APPROVED_REASON &&
      error.reasonCategory === AUTHORIZATION_ERROR_CATEGORY)
  ) {
    return "project_not_approved"
  }
  if (PERMISSION_DENIED_REASONS.has(reason)) {
    return "permission_denied"
  }
  if (
    API_NOT_ENABLED_REASONS.has(reason) ||
    API_DISABLED_MESSAGE_PATTERN.test(error.message)
  ) {
    return "api_not_enabled"
  }
  if (
    CREDENTIAL_REASONS.has(reason) ||
    error.apiStatus === "UNAUTHENTICATED" ||
    error.httpStatusCode === HTTP_UNAUTHORIZED
  ) {
    return "credentials_invalid"
  }
  // A 403 with no recognisable reason is NOT evidence of a bad developer token
  // (only DEVELOPER_TOKEN_* reasons are): report a generic permission failure.
  if (error.httpStatusCode === HTTP_FORBIDDEN) {
    return "permission_denied"
  }
  return
}

/**
 * Maps a failed Google Ads call during candidate listing onto a stable cause
 * the picker can translate, or `undefined` for anything unrecognised (which
 * then keeps the generic provider-error handling).
 */
export const classifyGoogleAdsFailure = (
  error: unknown,
): GoogleAdsConnectFailure | undefined => {
  if (error instanceof AuthException) {
    return "credentials_invalid"
  }
  if (error instanceof GoogleAdsException) {
    return classifyGoogleAdsException(error)
  }
  return
}
