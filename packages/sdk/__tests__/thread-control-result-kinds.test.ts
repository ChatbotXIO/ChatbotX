import { describe, expect, it } from "vitest"
import type {
  ThreadControlAppRolesEvent,
  ThreadControlRequestEvent,
  ThreadControlWebhookResult,
} from "../src"

const describeKind = (result: ThreadControlWebhookResult): string => {
  switch (result.kind) {
    case "handover":
      return `handover:${result.event.event}`
    case "standbyMessage":
      return "standbyMessage"
    case "handoverRequest":
      return `request:${result.event.requestedOwnerAppId ?? "none"}`
    case "appRoles":
      return `appRoles:${Object.keys(result.event.roles).join(",")}`
    default: {
      // Compile-time exhaustiveness: a new kind must be handled above.
      const exhaustive: never = result
      return exhaustive
    }
  }
}

describe("ThreadControlWebhookResult kinds", () => {
  it("expresses request and app_roles apart from the handover union", () => {
    const occurredAt = new Date(0)
    const request: ThreadControlRequestEvent = {
      contact: { sourceId: "psid" },
      requestedOwnerAppId: "333",
      occurredAt,
    }
    const appRoles: ThreadControlAppRolesEvent = {
      accountId: "page",
      roles: { "111": ["primary_receiver"] },
      occurredAt,
    }
    expect(describeKind({ kind: "handoverRequest", event: request })).toBe(
      "request:333",
    )
    expect(describeKind({ kind: "appRoles", event: appRoles })).toBe(
      "appRoles:111",
    )
    expect(
      describeKind({
        kind: "handover",
        event: {
          contact: { sourceId: "psid" },
          event: "controlPassed",
          previousOwnerRole: null,
          newOwnerRole: null,
          newOwnerAppId: "111",
          occurredAt,
        },
      }),
    ).toBe("handover:controlPassed")
  })
})
