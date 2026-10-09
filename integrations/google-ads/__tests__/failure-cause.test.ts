import {
  AuthException,
  ConnectionProviderRejectedError,
} from "@chatbotx.io/sdk"
import { connectFailureCauses } from "@chatbotx.io/utils/connection"
import { describe, expect, test } from "vitest"
import { GoogleAdsException } from "../src/exception"
import {
  classifyGoogleAdsFailure,
  GOOGLE_ADS_FAILURE_MESSAGES,
} from "../src/lib/failure-cause"

const TOKEN_LIKE_PATTERN = /[A-Za-z0-9_-]{20,}/

const googleError = (
  source: Partial<ConstructorParameters<typeof GoogleAdsException>[0]>,
) => new GoogleAdsException({ httpStatusCode: 400, details: [], ...source })

describe("classifyGoogleAdsFailure", () => {
  test.each([
    ["DEVELOPER_TOKEN_NOT_APPROVED", 403, "developer_token_not_approved"],
    ["DEVELOPER_TOKEN_PROHIBITED", 403, "developer_token_not_approved"],
    ["DEVELOPER_TOKEN_NOT_ON_ALLOWLIST", 403, "developer_token_not_approved"],
    ["DEVELOPER_TOKEN_PARAMETER_MISSING", 401, "developer_token_missing"],
    ["CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION", 403, "project_not_approved"],
    ["USER_PERMISSION_DENIED", 403, "permission_denied"],
    ["CUSTOMER_NOT_ENABLED", 403, "permission_denied"],
    ["SERVICE_DISABLED", 403, "api_not_enabled"],
    ["API_NOT_ENABLED", 403, "api_not_enabled"],
    ["OAUTH_TOKEN_REVOKED", 401, "credentials_invalid"],
    ["NOT_ADS_USER", 403, "no_ads_account"],
  ])("reason %s (HTTP %i) -> %s", (reason, httpStatusCode, expected) => {
    expect(
      classifyGoogleAdsFailure(googleError({ reason, httpStatusCode })),
    ).toBe(expected)
  })

  test("ACTION_NOT_PERMITTED is project_not_approved only as an authorizationError", () => {
    expect(
      classifyGoogleAdsFailure(
        googleError({
          reason: "ACTION_NOT_PERMITTED",
          reasonCategory: "authorizationError",
          httpStatusCode: 403,
        }),
      ),
    ).toBe("project_not_approved")
    expect(
      classifyGoogleAdsFailure(
        googleError({
          reason: "ACTION_NOT_PERMITTED",
          reasonCategory: "mutateError",
          httpStatusCode: 403,
        }),
      ),
    ).toBe("permission_denied")
    expect(
      classifyGoogleAdsFailure(
        googleError({ reason: "ACTION_NOT_PERMITTED", httpStatusCode: 403 }),
      ),
    ).toBe("permission_denied")
  })

  test("a bare 403 with no reason is a generic permission failure, never a token blame", () => {
    expect(classifyGoogleAdsFailure(googleError({ httpStatusCode: 403 }))).toBe(
      "permission_denied",
    )
    expect(
      classifyGoogleAdsFailure(
        googleError({ httpStatusCode: 403, reason: "SOMETHING_NEW" }),
      ),
    ).toBe("permission_denied")
  })

  test("a 403 whose message says the API is disabled is api_not_enabled, not a token problem", () => {
    expect(
      classifyGoogleAdsFailure(
        googleError({
          httpStatusCode: 403,
          message:
            "Google Ads API has not been used in project 123 before or it is disabled.",
        }),
      ),
    ).toBe("api_not_enabled")
  })

  test("a 401 or UNAUTHENTICATED status is credentials_invalid", () => {
    expect(classifyGoogleAdsFailure(googleError({ httpStatusCode: 401 }))).toBe(
      "credentials_invalid",
    )
    expect(
      classifyGoogleAdsFailure(
        googleError({ httpStatusCode: 400, apiStatus: "UNAUTHENTICATED" }),
      ),
    ).toBe("credentials_invalid")
  })

  test("an AuthException is credentials_invalid", () => {
    expect(classifyGoogleAdsFailure(new AuthException("rejected"))).toBe(
      "credentials_invalid",
    )
  })

  test.each([
    googleError({ httpStatusCode: 500 }),
    googleError({ httpStatusCode: 400, reason: "INVALID_ARGUMENT" }),
    new Error("boom"),
    new ConnectionProviderRejectedError("x"),
    "string",
    undefined,
  ])("leaves an unrecognised failure alone (%#)", (error) => {
    expect(classifyGoogleAdsFailure(error)).toBeUndefined()
  })

  test("every cause has a fixed public message that never carries a token", () => {
    expect(Object.keys(GOOGLE_ADS_FAILURE_MESSAGES).sort()).toEqual(
      [...connectFailureCauses.options].sort(),
    )
    for (const message of Object.values(GOOGLE_ADS_FAILURE_MESSAGES)) {
      expect(message).not.toMatch(TOKEN_LIKE_PATTERN)
    }
  })
})
