import { describe, expect, test } from "vitest"
import {
  type ConnectionEvent,
  isActiveConnectionStatus,
  transitionConnection,
} from "../state"

describe("isActiveConnectionStatus", () => {
  test("connected and degraded are ACTIVE; needs_reauth, paused, disconnected are not", () => {
    expect(isActiveConnectionStatus("connected")).toBe(true)
    expect(isActiveConnectionStatus("degraded")).toBe(true)
    expect(isActiveConnectionStatus("needs_reauth")).toBe(false)
    expect(isActiveConnectionStatus("paused")).toBe(false)
    expect(isActiveConnectionStatus("disconnected")).toBe(false)
  })
})

describe("transitionConnection — quota edge invariant", () => {
  test("connect.completed from absent/disconnected/needs_reauth consumes quota exactly once", () => {
    for (const from of [undefined, "disconnected", "needs_reauth"] as const) {
      const result = transitionConnection({ from, event: "connect.completed" })
      expect(result.to).toBe("connected")
      expect(result.quotaEdge).toBe("consume")
    }
  })

  test("connect.completed from an already-ACTIVE status is an idempotent no-op with no quota change", () => {
    for (const from of ["connected", "degraded"] as const) {
      const result = transitionConnection({ from, event: "connect.completed" })
      expect(result.to).toBe(from)
      expect(result.noop).toBe(true)
      expect(result.quotaEdge).toBeNull()
    }
  })

  test("user.disconnect from an ACTIVE status releases quota exactly once", () => {
    for (const from of ["connected", "degraded"] as const) {
      const result = transitionConnection({ from, event: "user.disconnect" })
      expect(result.to).toBe("disconnected")
      expect(result.quotaEdge).toBe("release")
    }
  })

  test("user.disconnect from an already-INACTIVE status changes nothing quota-wise", () => {
    for (const from of ["needs_reauth", "paused", "disconnected"] as const) {
      const result = transitionConnection({ from, event: "user.disconnect" })
      expect(result.quotaEdge).toBeNull()
    }
  })

  test("auth.revoked from ACTIVE releases quota and lands on needs_reauth", () => {
    for (const from of ["connected", "degraded"] as const) {
      const result = transitionConnection({ from, event: "auth.revoked" })
      expect(result.to).toBe("needs_reauth")
      expect(result.quotaEdge).toBe("release")
      expect(result.reason).toBe("token_revoked")
    }
  })

  test("auth.revoked against an already-INACTIVE status is an idempotent no-op", () => {
    for (const from of ["needs_reauth", "paused", "disconnected"] as const) {
      const result = transitionConnection({ from, event: "auth.revoked" })
      expect(result.to).toBe(from)
      expect(result.quotaEdge).toBeNull()
    }
  })

  test("refresh.transient_failure degrades an ACTIVE connection with no quota change", () => {
    for (const from of ["connected", "degraded"] as const) {
      const result = transitionConnection({
        from,
        event: "refresh.transient_failure",
      })
      expect(result.to).toBe("degraded")
      expect(result.quotaEdge).toBeNull()
    }
  })

  test("refresh/verify events against an INACTIVE status throw (409 CONNECTION_INACTIVE at the API layer)", () => {
    for (const from of ["needs_reauth", "paused", "disconnected"] as const) {
      expect(() =>
        transitionConnection({ from, event: "refresh.transient_failure" }),
      ).toThrow()
      expect(() => transitionConnection({ from, event: "verify.ok" })).toThrow()
      expect(() =>
        transitionConnection({ from, event: "verify.failed_non_auth" }),
      ).toThrow()
    }
  })

  test("auth.saved / verify.ok clear degraded back to connected with no quota change", () => {
    for (const event of ["auth.saved", "verify.ok"] as const) {
      const result = transitionConnection({ from: "degraded", event })
      expect(result.to).toBe("connected")
      expect(result.quotaEdge).toBeNull()
    }
  })

  test("teardown.pause releases quota from ACTIVE and is a no-op from INACTIVE", () => {
    for (const from of ["connected", "degraded"] as const) {
      const result = transitionConnection({ from, event: "teardown.pause" })
      expect(result.to).toBe("paused")
      expect(result.quotaEdge).toBe("release")
    }
    for (const from of ["needs_reauth", "paused", "disconnected"] as const) {
      const result = transitionConnection({ from, event: "teardown.pause" })
      expect(result.quotaEdge).toBeNull()
    }
  })

  test("teardown.resume from paused consumes quota; from any other status is a no-op", () => {
    const resumed = transitionConnection({
      from: "paused",
      event: "teardown.resume",
    })
    expect(resumed.to).toBe("connected")
    expect(resumed.quotaEdge).toBe("consume")

    for (const from of [
      "connected",
      "degraded",
      "needs_reauth",
      "disconnected",
    ] as const) {
      const result = transitionConnection({ from, event: "teardown.resume" })
      expect(result.to).toBe(from)
      expect(result.quotaEdge).toBeNull()
    }
  })

  test("teardown.disconnect always lands on disconnected(workspace_purge) by default, releasing quota exactly when ACTIVE", () => {
    for (const from of ["connected", "degraded"] as const) {
      const result = transitionConnection({
        from,
        event: "teardown.disconnect",
      })
      expect(result.to).toBe("disconnected")
      expect(result.reason).toBe("workspace_purge")
      expect(result.quotaEdge).toBe("release")
    }
    for (const from of ["needs_reauth", "paused", "disconnected"] as const) {
      const result = transitionConnection({
        from,
        event: "teardown.disconnect",
      })
      expect(result.quotaEdge).toBeNull()
    }
  })

  test("every event/from combination in the state table resolves without throwing, except the documented refresh/verify-on-INACTIVE cases", () => {
    const allEvents: ConnectionEvent[] = [
      "connect.completed",
      "auth.saved",
      "refresh.transient_failure",
      "verify.failed_non_auth",
      "verify.ok",
      "auth.revoked",
      "user.disconnect",
      "teardown.pause",
      "teardown.resume",
      "teardown.disconnect",
    ]
    const allStatuses = [
      undefined,
      "connected",
      "degraded",
      "needs_reauth",
      "paused",
      "disconnected",
    ] as const
    const throwsOnInactive = new Set<ConnectionEvent>([
      "refresh.transient_failure",
      "verify.failed_non_auth",
      "verify.ok",
      "auth.saved",
    ])

    for (const from of allStatuses) {
      for (const event of allEvents) {
        const isInactive = from === undefined || !isActiveConnectionStatus(from)
        if (isInactive && throwsOnInactive.has(event)) {
          expect(() => transitionConnection({ from, event })).toThrow()
        } else {
          expect(() => transitionConnection({ from, event })).not.toThrow()
        }
      }
    }
  })
})
