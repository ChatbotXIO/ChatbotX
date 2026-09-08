// @vitest-environment node

import {
  channelDuplicatedException,
  connectSessionExpiredException,
  notWorkspaceMemberException,
} from "@chatbotx.io/business/errors"
import { SdkException } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// `connect-action-outcomes.ts` extracts plan §2.4 steps 5-8 out of the three
// (Messenger + two Instagram) per-account connect actions: the outcome
// literals (`notSelectable`, `duplicated`, `connected`), the best-effort
// follow-up wrapper, and the outer session-error/item-failure catch. This
// file pins every branch directly — the action tests
// (`messenger-select-page-action.test.ts`,
// `instagram-select-account-facebook-action.test.ts`,
// `instagram-select-account-action.test.ts`) only assert that each action
// calls through to these helpers correctly, not their internals a second
// time.
// ---------------------------------------------------------------------------

const { loggerWarnMock, loggerErrorMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: loggerWarnMock, error: loggerErrorMock, info: vi.fn() },
}))

const {
  connectedOutcome,
  duplicatedOutcome,
  notSelectableOutcome,
  runConnectFollowUps,
  toConnectActionFailure,
} = await import("@/features/channel-connect/lib/connect-action-outcomes")

describe("notSelectableOutcome", () => {
  test("returns a failed/notSelectable outcome with the given identity", () => {
    expect(notSelectableOutcome({ sourceId: "id-1", name: "Name 1" })).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "id-1",
        name: "Name 1",
        status: "failed",
        reason: "notSelectable",
        coexistEligible: false,
      },
    })
  })
})

describe("duplicatedOutcome", () => {
  test("returns a duplicated/alreadyConnected outcome with the given identity", () => {
    expect(duplicatedOutcome({ sourceId: "id-2", name: "Name 2" })).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "id-2",
        name: "Name 2",
        status: "duplicated",
        reason: "alreadyConnected",
        coexistEligible: false,
      },
    })
  })
})

describe("connectedOutcome", () => {
  test("returns a connected outcome with warning undefined when nothing failed", () => {
    expect(
      connectedOutcome({
        sourceId: "id-3",
        name: "Name 3",
        integrationId: "int-1",
        warning: undefined,
        coexistEligible: true,
      }),
    ).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "id-3",
        name: "Name 3",
        status: "connected",
        warning: undefined,
        integrationId: "int-1",
        coexistEligible: true,
      },
    })
  })

  test("carries a followUpFailed warning through unchanged", () => {
    const result = connectedOutcome({
      sourceId: "id-4",
      name: "Name 4",
      integrationId: "int-2",
      warning: "followUpFailed",
      coexistEligible: false,
    })

    expect(result.kind).toBe("outcome")
    expect(result.kind === "outcome" && result.outcome.warning).toBe(
      "followUpFailed",
    )
    expect(result.kind === "outcome" && result.outcome.coexistEligible).toBe(
      false,
    )
  })
})

describe("runConnectFollowUps", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("resolves undefined and never logs when the follow-up succeeds", async () => {
    const run = vi.fn().mockResolvedValue(undefined)

    const warning = await runConnectFollowUps(run, {
      message: "should not appear",
    })

    expect(warning).toBeUndefined()
    expect(run).toHaveBeenCalledTimes(1)
    expect(loggerWarnMock).not.toHaveBeenCalled()
  })

  test("resolves followUpFailed and logs a warning (with context merged) when the follow-up throws", async () => {
    const error = new Error("branding failed")
    const run = vi.fn().mockRejectedValue(error)

    const warning = await runConnectFollowUps(run, {
      message: "follow-up failed for X",
      context: { integrationId: "int-5" },
    })

    expect(warning).toBe("followUpFailed")
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: error, integrationId: "int-5" },
      "follow-up failed for X",
    )
  })

  test("never rejects, and never lets the follow-up error escape", async () => {
    const run = vi.fn().mockRejectedValue(new Error("boom"))

    await expect(runConnectFollowUps(run, { message: "m" })).resolves.toBe(
      "followUpFailed",
    )
  })
})

describe("toConnectActionFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("maps a session-level exception to a sessionError result without logging an item-level error", () => {
    const result = toConnectActionFailure(
      connectSessionExpiredException("Your connect session expired."),
      {
        sourceId: "id-6",
        name: "Name 6",
        log: "should not be logged as item failure",
      },
    )

    expect(result).toEqual({ kind: "sessionError", code: "sessionExpired" })
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  test("maps notWorkspaceMember to the notMember session error", () => {
    const result = toConnectActionFailure(notWorkspaceMemberException(), {
      sourceId: "id-7",
      name: "Name 7",
      log: "unused",
    })

    expect(result).toEqual({ kind: "sessionError", code: "notMember" })
  })

  test("maps a duplicate-unique-violation exception to an item-level duplicated outcome and logs it", () => {
    const result = toConnectActionFailure(channelDuplicatedException(), {
      sourceId: "id-8",
      name: "Name 8",
      log: "connect failed",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "id-8",
        name: "Name 8",
        status: "duplicated",
        reason: "alreadyConnected",
        coexistEligible: false,
      },
    })
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: expect.anything() },
      "connect failed",
    )
  })

  test("maps an SdkException to a providerRejected item-level outcome", () => {
    const error = new SdkException("Meta rejected the request")

    const result = toConnectActionFailure(error, {
      sourceId: "id-9",
      name: "Name 9",
      log: "connect failed",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "id-9",
        name: "Name 9",
        status: "failed",
        reason: "providerRejected",
        // The provider's own words reach the wire, not just our reason code.
        coexistEligible: false,
      },
    })
  })

  test("maps an unrecognized error to an unknown item-level outcome", () => {
    const result = toConnectActionFailure(new Error("something else"), {
      sourceId: "id-10",
      name: "Name 10",
      log: "connect failed",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "id-10",
        name: "Name 10",
        status: "failed",
        reason: "unknown",
        coexistEligible: false,
      },
    })
  })
})
