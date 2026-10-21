// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { describe, expect, test, vi } from "vitest"

// `create-first-workspace` imports `workspaceService` for an unrelated path;
// the real barrel drags in realtime/DB wiring this pure mapping never touches.
vi.mock("@chatbotx.io/business", () => ({ workspaceService: {} }))

const SESSION_ERROR_KEY_PREFIX = /^channels\.connectMany\.sessionError\./

const { selectPageErrorCode, startFailureErrorCode } = await import(
  "@/features/channel-connect/lib/connect-error-code"
)
const {
  CREATE_CHANNEL_ERROR_MESSAGE_KEYS,
  createChannelPath,
  isCreateChannelErrorCode,
} = await import("@/lib/workspace/create-first-workspace")

describe("createChannelPath", () => {
  test("keeps the workspace alongside the error", () => {
    expect(createChannelPath({ error: "noPages", workspaceId: "ws-1" })).toBe(
      "/channels/create?workspaceId=ws-1&error=noPages",
    )
  })

  test("without a workspace it is the first-workspace picker", () => {
    expect(createChannelPath({ error: "sessionExpired" })).toBe(
      "/channels/create?error=sessionExpired",
    )
    expect(createChannelPath({})).toBe("/channels/create")
  })
})

function expiredWith(failureCode?: string) {
  const error = new ChatbotXException(
    "Your connect session expired. Please start again.",
    "connectSessionExpired",
  )
  if (failureCode) {
    error.data = { failureCode }
  }
  return error
}

describe("startFailureErrorCode", () => {
  test("the active connect-session cap asks the user to wait", () => {
    const error = new ChatbotXException(
      "Too many pending connect sessions for this workspace.",
      "connectSessionLimitReached",
      429,
    )
    expect(startFailureErrorCode(error)).toBe("tooManyAttempts")
  })

  test("a known plan-limit code passes through", () => {
    const error = new ChatbotXException("limit", "workspaceLimitReached", 403)
    expect(startFailureErrorCode(error)).toBe("workspaceLimitReached")
  })

  test("anything unexpected is a failed connect, never an expired session", () => {
    expect(startFailureErrorCode(new Error("db down"))).toBe("connectFailed")
    expect(
      startFailureErrorCode(new ChatbotXException("x", "somethingElse")),
    ).toBe("connectFailed")
  })
})

describe("selectPageErrorCode", () => {
  const pages = { noCandidatesError: "noPages" } as const

  test("no_candidates uses the copy the channel's page chose", () => {
    expect(selectPageErrorCode(expiredWith("no_candidates"), pages)).toBe(
      "noPages",
    )
    expect(
      selectPageErrorCode(expiredWith("no_candidates"), {
        noCandidatesError: "noInstagramAccounts",
      }),
    ).toBe("noInstagramAccounts")
  })

  test.each([
    ["exchange_failed", "exchangeFailed"],
    ["provider_error", "providerError"],
    ["internal_error", "connectFailed"],
  ] as const)("the owner's failed session %s maps to %s", (failureCode, expected) => {
    expect(selectPageErrorCode(expiredWith(failureCode), pages)).toBe(expected)
  })

  test("an expired session without an actionable reason stays sessionExpired", () => {
    expect(selectPageErrorCode(expiredWith(), pages)).toBe("sessionExpired")
    expect(selectPageErrorCode(expiredWith("expired"), pages)).toBe(
      "sessionExpired",
    )
  })

  test.each([
    ["provider_unavailable", "providerError"],
    ["no_candidates", "noPages"],
    ["internal_error", "connectFailed"],
  ] as const)("connect_error=%s explains itself as %s", (connectError, expected) => {
    expect(selectPageErrorCode(expiredWith(), { ...pages, connectError })).toBe(
      expected,
    )
  })

  test("the session's own failure reason wins over connect_error", () => {
    expect(
      selectPageErrorCode(expiredWith("no_candidates"), {
        ...pages,
        connectError: "provider_unavailable",
      }),
    ).toBe("noPages")
  })

  test("an unknown connect_error keeps the generic copy", () => {
    expect(
      selectPageErrorCode(expiredWith(), {
        ...pages,
        connectError: "<script>",
      }),
    ).toBe("sessionExpired")
  })

  test("connect_error never masks a membership or plan failure", () => {
    const error = new ChatbotXException("Trial expired", "trialExpired", 403)
    expect(
      selectPageErrorCode(error, {
        ...pages,
        connectError: "provider_unavailable",
      }),
    ).toBe("trialExpired")
  })

  test("a lost workspace membership says so instead of expiring", () => {
    const error = new ChatbotXException(
      "You are not a member of this workspace.",
      "notWorkspaceMember",
      403,
    )
    expect(selectPageErrorCode(error, pages)).toBe("notMember")
  })

  test("an unknown exception code falls back to sessionExpired", () => {
    const error = new ChatbotXException("nope", "somethingElse")
    expect(selectPageErrorCode(error, pages)).toBe("sessionExpired")
  })

  test("every code it can return has a message on the create page", () => {
    for (const code of [
      "noPages",
      "noInstagramAccounts",
      "exchangeFailed",
      "providerError",
      "notMember",
      "connectFailed",
      "tooManyAttempts",
    ]) {
      expect(isCreateChannelErrorCode(code)).toBe(true)
      expect(
        CREATE_CHANNEL_ERROR_MESSAGE_KEYS[
          code as keyof typeof CREATE_CHANNEL_ERROR_MESSAGE_KEYS
        ],
      ).toMatch(SESSION_ERROR_KEY_PREFIX)
    }
  })
})
