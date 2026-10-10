import { describe, expect, test } from "vitest"
import {
  ACTIVE_CONNECT_SESSION_STATUSES,
  ACTIVE_CONNECTION_STATUSES,
  appendConnectError,
  CONNECTION_TO_INBOX_DISCONNECT_REASON,
  connectFailureCauseOf,
  connectionStatuses,
  connectionStatusReasons,
  connectSessionNextActionSchema,
  connectSessionStatuses,
  INACTIVE_CONNECTION_STATUSES,
  inboxDisconnectReasons,
  TERMINAL_CONNECT_SESSION_STATUSES,
} from "../src/connection"

describe("CONNECTION_TO_INBOX_DISCONNECT_REASON", () => {
  test("maps every connection status reason", () => {
    expect(Object.keys(CONNECTION_TO_INBOX_DISCONNECT_REASON).sort()).toEqual(
      [...connectionStatusReasons.options].sort(),
    )
  })

  test("maps every connection status reason to a valid inbox disconnect reason", () => {
    for (const reason of connectionStatusReasons.options) {
      expect(inboxDisconnectReasons.options).toContain(
        CONNECTION_TO_INBOX_DISCONNECT_REASON[reason],
      )
    }
  })

  test("maps workspace_purge, trial_expired, and tenant_suspended 1-1 instead of collapsing them into `manual`", () => {
    expect(CONNECTION_TO_INBOX_DISCONNECT_REASON.workspace_purge).toBe(
      "workspace_purge",
    )
    expect(CONNECTION_TO_INBOX_DISCONNECT_REASON.trial_expired).toBe(
      "trial_expired",
    )
    expect(CONNECTION_TO_INBOX_DISCONNECT_REASON.tenant_suspended).toBe(
      "tenant_suspended",
    )
  })
})

describe("connection status partitions", () => {
  test("partition every connection status without overlap", () => {
    expect(
      ACTIVE_CONNECTION_STATUSES.some((status) =>
        INACTIVE_CONNECTION_STATUSES.includes(status),
      ),
    ).toBe(false)
    expect(
      [...ACTIVE_CONNECTION_STATUSES, ...INACTIVE_CONNECTION_STATUSES].sort(),
    ).toEqual([...connectionStatuses.options].sort())
  })

  test("partition every connect session status without overlap", () => {
    expect(
      ACTIVE_CONNECT_SESSION_STATUSES.some((status) =>
        TERMINAL_CONNECT_SESSION_STATUSES.includes(status),
      ),
    ).toBe(false)
    expect(
      [
        ...ACTIVE_CONNECT_SESSION_STATUSES,
        ...TERMINAL_CONNECT_SESSION_STATUSES,
      ].sort(),
    ).toEqual([...connectSessionStatuses.options].sort())
  })
})

describe("connectSessionNextActionSchema", () => {
  test("rejects an unknown next-action type", () => {
    expect(
      connectSessionNextActionSchema.safeParse({ type: "redirect" }).success,
    ).toBe(false)
  })
})

describe("appendConnectError", () => {
  test("adds the code to a relative return URL and keeps its query and hash", () => {
    expect(
      appendConnectError("/space/1/settings?session=9#top", "internal_error"),
    ).toBe("/space/1/settings?session=9&connect_error=internal_error#top")
  })

  test("replaces an existing connect_error value", () => {
    expect(
      appendConnectError("/a?connect_error=x&b=1", "provider_unavailable"),
    ).toBe("/a?connect_error=provider_unavailable&b=1")
  })

  test("keeps an absolute return URL absolute", () => {
    expect(
      appendConnectError("https://app.example.com/a?b=1", "internal_error"),
    ).toBe("https://app.example.com/a?b=1&connect_error=internal_error")
  })

  test.each([
    "/..//evil.example",
    "/.//evil.example/x",
    "/%2e%2e//evil.example",
    "//evil.example",
    "/\\evil.example",
  ])("never emits a protocol-relative or backslash redirect for %s", (input) => {
    const out = appendConnectError(input, "internal_error")

    expect(out.startsWith("/")).toBe(true)
    expect(out.startsWith("//")).toBe(false)
    expect(out.includes("\\")).toBe(false)
    expect(out).toContain("connect_error=internal_error")
  })
})

describe("connectFailureCauseOf", () => {
  test("reads an allow-listed cause from failureCause or data.cause", () => {
    expect(connectFailureCauseOf({ failureCause: "permission_denied" })).toBe(
      "permission_denied",
    )
    expect(
      connectFailureCauseOf({ failureCause: "project_not_approved" }),
    ).toBe("project_not_approved")
    expect(connectFailureCauseOf({ data: { cause: "api_not_enabled" } })).toBe(
      "api_not_enabled",
    )
  })

  test.each([
    null,
    undefined,
    "x",
    new Error("boom"),
    { failureCause: "<script>" },
    { data: { cause: "internal_error" } },
    { data: null },
  ])("ignores anything else (%#)", (value) => {
    expect(connectFailureCauseOf(value)).toBeUndefined()
  })
})
