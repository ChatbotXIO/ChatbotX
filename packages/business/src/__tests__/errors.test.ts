import { describe, expect, test } from "vitest"
import {
  BROADCAST_PLAN_LIMIT_CODE,
  broadcastPlanLimitException,
  ChatbotXException,
  channelDuplicatedException,
  channelHiddenException,
  channelLimitReachedException,
  connectionAlreadyConnectedException,
  connectionCredentialsRejectedException,
  connectionIdentityMismatchException,
  connectionInactiveException,
  connectionInProgressException,
  connectionNoCandidatesException,
  connectionNotConfiguredException,
  connectionNotOAuthException,
  connectionNotRefreshableException,
  connectionProviderUnavailableException,
  connectionStateMismatchException,
  connectionWrongStrategyException,
  connectSessionExpiredException,
  credentialMissingException,
  notFoundException,
  notWorkspaceMemberException,
  summaryAlreadyGeneratingException,
  validationException,
  workspaceDeletionStartedException,
  workspaceLimitReachedException,
} from "../errors"

/**
 * Every exception factory that takes zero or one `string` argument, table-
 * driven over its `code`/`httpStatusCode` contract — the status code is what
 * callers actually branch on (API handlers map it to an HTTP response), so a
 * drifted value here is a silent behavior change, not just a cosmetic one.
 */
const SIMPLE_FACTORIES: {
  name: string
  factory: (arg: string) => ChatbotXException
  code: string
  httpStatusCode: number
}[] = [
  {
    name: "workspaceDeletionStartedException",
    factory: () => workspaceDeletionStartedException(),
    code: "workspaceDeletionStarted",
    httpStatusCode: 409,
  },
  {
    name: "notFoundException",
    factory: (message) => notFoundException(message),
    code: "notFound",
    httpStatusCode: 404,
  },
  {
    name: "channelDuplicatedException",
    factory: () => channelDuplicatedException(),
    code: "channelDuplicated",
    httpStatusCode: 400,
  },
  {
    name: "credentialMissingException",
    factory: (message) => credentialMissingException(message),
    code: "credentialMissing",
    httpStatusCode: 400,
  },
  {
    name: "notWorkspaceMemberException",
    factory: () => notWorkspaceMemberException(),
    code: "notWorkspaceMember",
    httpStatusCode: 403,
  },
  {
    name: "channelLimitReachedException",
    factory: () => channelLimitReachedException(),
    code: "channelLimitReached",
    httpStatusCode: 400,
  },
  {
    name: "summaryAlreadyGeneratingException",
    factory: () => summaryAlreadyGeneratingException(),
    code: "summaryAlreadyGenerating",
    httpStatusCode: 409,
  },
  {
    name: "workspaceLimitReachedException",
    factory: () => workspaceLimitReachedException(),
    code: "workspaceLimitReached",
    httpStatusCode: 400,
  },
  {
    name: "connectionInactiveException",
    factory: () => connectionInactiveException(),
    code: "connectionInactive",
    httpStatusCode: 409,
  },
  {
    name: "connectionNotConfiguredException",
    factory: (provider) => connectionNotConfiguredException(provider),
    code: "connectionNotConfigured",
    httpStatusCode: 400,
  },
  {
    name: "connectionNotRefreshableException",
    factory: (provider) => connectionNotRefreshableException(provider),
    code: "connectionNotRefreshable",
    httpStatusCode: 400,
  },
  {
    name: "connectionAlreadyConnectedException",
    factory: () => connectionAlreadyConnectedException(),
    code: "connectionAlreadyConnected",
    httpStatusCode: 409,
  },
  {
    name: "connectionInProgressException",
    factory: () => connectionInProgressException(),
    code: "connectionInProgress",
    httpStatusCode: 409,
  },
  {
    name: "connectionWrongStrategyException",
    factory: (provider) => connectionWrongStrategyException(provider),
    code: "connectionWrongStrategy",
    httpStatusCode: 400,
  },
  {
    name: "connectionCredentialsRejectedException",
    factory: (message) => connectionCredentialsRejectedException(message),
    code: "connectionCredentialsRejected",
    httpStatusCode: 400,
  },
  {
    name: "connectionNotOAuthException",
    factory: (provider) => connectionNotOAuthException(provider),
    code: "connectionNotOAuth",
    httpStatusCode: 400,
  },
  {
    name: "connectionStateMismatchException",
    factory: () => connectionStateMismatchException(),
    code: "connectionStateMismatch",
    httpStatusCode: 400,
  },
  {
    name: "connectionNoCandidatesException",
    factory: () => connectionNoCandidatesException(),
    code: "connectionNoCandidates",
    httpStatusCode: 400,
  },
  {
    name: "connectionIdentityMismatchException",
    factory: () => connectionIdentityMismatchException(),
    code: "connectionIdentityMismatch",
    httpStatusCode: 400,
  },
  {
    name: "channelHiddenException",
    factory: (channel) => channelHiddenException(channel),
    code: "channelHidden",
    httpStatusCode: 403,
  },
]

test.each(
  SIMPLE_FACTORIES,
)("$name produces a ChatbotXException with code $code and httpStatusCode $httpStatusCode", ({
  factory,
  code,
  httpStatusCode,
}) => {
  const error = factory("arg")
  expect(error).toBeInstanceOf(ChatbotXException)
  expect(error).toMatchObject({ code, httpStatusCode })
  expect(error.message.length).toBeGreaterThan(0)
})

describe("connectionProviderUnavailableException", () => {
  test.each([
    502, 503,
  ] as const)("carries the caller-supplied %d status through to httpStatusCode", (httpStatusCode) => {
    expect(
      connectionProviderUnavailableException(httpStatusCode),
    ).toMatchObject({
      code: "connectionProviderUnavailable",
      httpStatusCode,
    })
  })
})

describe("connectSessionExpiredException", () => {
  test("defaults to the connectSessionExpired code", () => {
    expect(connectSessionExpiredException("expired")).toMatchObject({
      code: "connectSessionExpired",
      httpStatusCode: 400,
    })
  })

  test("accepts the signupSessionExpired code for WhatsApp's signup-session claim", () => {
    expect(
      connectSessionExpiredException("expired", "signupSessionExpired"),
    ).toMatchObject({
      code: "signupSessionExpired",
      httpStatusCode: 400,
    })
  })
})

describe("validationException", () => {
  test("attaches the field name and optional data payload for form-level mapping", () => {
    const error = validationException("email", "Email is required", {
      min: 1,
    })
    expect(error).toMatchObject({
      code: "validation",
      httpStatusCode: 422,
      field: "email",
      data: { min: 1 },
    })
  })
})

describe("broadcastPlanLimitException", () => {
  const policy = {
    kind: "restricted" as const,
    maxSendRatePerMinute: 60,
    maxActiveBroadcasts: 2,
    channels: ["messenger"] as const,
    display: { sendRatePerMinute: 60, upgradeSpeedMultiplier: 2 },
  }

  test("maps the sendRate reason to its message and carries the policy in data", () => {
    const error = broadcastPlanLimitException("sendRate", {
      policy,
      planName: "Starter",
    })
    expect(error).toMatchObject({
      code: BROADCAST_PLAN_LIMIT_CODE,
      httpStatusCode: 403,
      data: {
        reason: "sendRate",
        planName: "Starter",
        maxSendRatePerMinute: 60,
        maxActiveBroadcasts: 2,
        displayedSendRatePerMinute: 60,
        upgradeSpeedMultiplier: 2,
      },
    })
  })

  test("maps the activeBroadcasts reason and omits planName when null", () => {
    const error = broadcastPlanLimitException("activeBroadcasts", {
      policy,
      planName: null,
    })
    expect(error.message).toContain("2 broadcast(s)")
    expect(error.data).not.toHaveProperty("planName")
  })
})
