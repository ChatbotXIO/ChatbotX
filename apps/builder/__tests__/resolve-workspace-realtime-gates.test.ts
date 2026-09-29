import { describe, expect, test } from "vitest"
import { resolveWorkspaceRealtimeGates } from "@/lib/workspace/resolve-workspace-realtime-gates"

const baseInput = {
  isSupportSession: false,
  scheduledForDeletion: false,
  cloud: false,
  blocked: false,
  hasCallCapableChannel: true,
}

describe("resolveWorkspaceRealtimeGates", () => {
  test("realtimeEnabled is always true for any resolved access", () => {
    expect(
      resolveWorkspaceRealtimeGates({ ...baseInput, permissions: {} })
        .realtimeEnabled,
    ).toBe(true)
    expect(
      resolveWorkspaceRealtimeGates({
        ...baseInput,
        permissions: { superAdmin: true },
        isSupportSession: true,
        scheduledForDeletion: true,
        cloud: true,
        blocked: true,
      }).realtimeEnabled,
    ).toBe(true)
  })

  test("any workspace member without contacts access gets no calling and no call history", () => {
    const gates = resolveWorkspaceRealtimeGates({
      ...baseInput,
      permissions: {},
    })
    expect(gates.callingEnabled).toBe(false)
    expect(gates.callHistoryEnabled).toBe(false)
  })

  test("a member with contacts access gets both calling and call history", () => {
    const gates = resolveWorkspaceRealtimeGates({
      ...baseInput,
      permissions: { contacts: true },
    })
    expect(gates.callingEnabled).toBe(true)
    expect(gates.callHistoryEnabled).toBe(true)
  })

  test("a member with only onlyAssignedContacts gets both", () => {
    const gates = resolveWorkspaceRealtimeGates({
      ...baseInput,
      permissions: { onlyAssignedContacts: true },
    })
    expect(gates.callingEnabled).toBe(true)
    expect(gates.callHistoryEnabled).toBe(true)
  })

  test("superAdmin gets both regardless of other flags", () => {
    const gates = resolveWorkspaceRealtimeGates({
      ...baseInput,
      permissions: { superAdmin: true },
    })
    expect(gates.callingEnabled).toBe(true)
    expect(gates.callHistoryEnabled).toBe(true)
  })

  test("analytics-only gets call history but not calling", () => {
    const gates = resolveWorkspaceRealtimeGates({
      ...baseInput,
      permissions: { analytics: true },
    })
    expect(gates.callingEnabled).toBe(false)
    expect(gates.callHistoryEnabled).toBe(true)
  })

  test("a support session disables calling but not call history", () => {
    const gates = resolveWorkspaceRealtimeGates({
      ...baseInput,
      permissions: { contacts: true },
      isSupportSession: true,
    })
    expect(gates.callingEnabled).toBe(false)
    expect(gates.callHistoryEnabled).toBe(true)
  })

  test("a workspace scheduled for deletion disables calling but not call history", () => {
    const gates = resolveWorkspaceRealtimeGates({
      ...baseInput,
      permissions: { contacts: true },
      scheduledForDeletion: true,
    })
    expect(gates.callingEnabled).toBe(false)
    expect(gates.callHistoryEnabled).toBe(true)
  })

  test("a blocked cloud owner disables calling but not call history", () => {
    const gates = resolveWorkspaceRealtimeGates({
      ...baseInput,
      permissions: { contacts: true },
      cloud: true,
      blocked: true,
    })
    expect(gates.callingEnabled).toBe(false)
    expect(gates.callHistoryEnabled).toBe(true)
  })

  test("a blocked self-hosted (non-cloud) owner still allows calling", () => {
    const gates = resolveWorkspaceRealtimeGates({
      ...baseInput,
      permissions: { contacts: true },
      cloud: false,
      blocked: true,
    })
    expect(gates.callingEnabled).toBe(true)
  })
})

describe("callHistoryNavVisible", () => {
  test("is hidden when the workspace has no call-capable channel, even with full access", () => {
    const gates = resolveWorkspaceRealtimeGates({
      ...baseInput,
      permissions: { superAdmin: true },
      hasCallCapableChannel: false,
    })
    expect(gates.callHistoryNavVisible).toBe(false)
    // The page and the call-artifact sheet stay reachable — only the nav
    // entry is narrowed.
    expect(gates.callHistoryEnabled).toBe(true)
  })

  test("is hidden when the member lacks call-history access, even with a call-capable channel", () => {
    const gates = resolveWorkspaceRealtimeGates({
      ...baseInput,
      permissions: {},
      hasCallCapableChannel: true,
    })
    expect(gates.callHistoryNavVisible).toBe(false)
  })

  test("is visible only when both access and a call-capable channel are present", () => {
    const gates = resolveWorkspaceRealtimeGates({
      ...baseInput,
      permissions: { contacts: true },
      hasCallCapableChannel: true,
    })
    expect(gates.callHistoryNavVisible).toBe(true)
  })

  test("stays visible for an analytics-only member of a call-capable workspace", () => {
    const gates = resolveWorkspaceRealtimeGates({
      ...baseInput,
      permissions: { analytics: true },
      hasCallCapableChannel: true,
    })
    expect(gates.callHistoryNavVisible).toBe(true)
  })
})
