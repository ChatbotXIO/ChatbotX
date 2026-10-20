import {
  signGuestConnectToken,
  signMemberConnectToken,
} from "@chatbotx.io/realtime-protocol"
import { describe, expect, test, vi } from "vitest"
import type { GuestSocketData, WorkspaceSocketData } from "../src/delivery"
import { createGuestSocketBehavior } from "../src/gateway-guest-socket"
import { createGatewayConnectionState } from "../src/gateway-shared"
import { createWorkspaceSocketBehavior } from "../src/gateway-workspace-socket"
import { createRealtimeServerCounters } from "../src/lib/realtime-metrics"

const SECRET = "gateway-socket-test-secret"

const createAbortedResponse = () => {
  let onAborted: (() => void) | undefined
  return {
    abort: () => onAborted?.(),
    response: {
      onAborted: (handler: () => void) => {
        onAborted = handler
      },
    },
  }
}

const workspaceRequest = (token: string) =>
  ({
    getHeader: () => "",
    getParameter: () => "workspace-1",
    getQuery: (name: string) => (name === "token" ? token : undefined),
  }) as never

const guestRequest = (token: string) =>
  ({
    getHeader: () => "",
    getParameter: () => "guest-1",
    getQuery: (name: string) => (name === "token" ? token : undefined),
  }) as never

describe("gateway socket upgrades", () => {
  test("releases a workspace stream reference when an admitted upgrade aborts", async () => {
    const { promise: activation, resolve: resolveActivation } =
      Promise.withResolvers<string>()
    const releaseWorkspace = vi.fn()
    const streamReader = {
      activateWorkspace: vi.fn(() => activation),
      releaseWorkspace,
    } as never
    const state = createGatewayConnectionState<
      WorkspaceSocketData,
      GuestSocketData
    >()
    const behavior = createWorkspaceSocketBehavior({
      addConnectedUser: () => undefined,
      counters: createRealtimeServerCounters(),
      delivery: {} as never,
      jitteredConnectionLifetimeMs: () => 1,
      logTokenRejection: () => undefined,
      maxConnections: 10,
      maxConnectionsPerWorkspace: 10,
      redis: { get: vi.fn().mockResolvedValue(null) } as never,
      removeConnectedUser: () => undefined,
      secret: SECRET,
      state,
      streamReader,
    })
    const token = await signMemberConnectToken(
      {
        chatScope: "all",
        issuedAtMs: Date.now(),
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      SECRET,
    )
    const { abort, response } = createAbortedResponse()

    behavior.upgrade?.(response as never, workspaceRequest(token), {} as never)
    await vi.waitFor(() =>
      expect(streamReader.activateWorkspace).toHaveBeenCalledWith(
        "workspace-1",
      ),
    )
    abort()
    resolveActivation("0-0")

    await vi.waitFor(() => {
      expect(releaseWorkspace).toHaveBeenCalledWith("workspace-1")
      expect(state.pendingUpgrades).toBe(0)
    })
  })
  test("does not add presence or arm a timer when sending the open-time cursor closes the workspace socket", () => {
    const addConnectedUser = vi.fn()
    const state = createGatewayConnectionState<
      WorkspaceSocketData,
      GuestSocketData
    >()
    const socketData = {
      chatScope: "all",
      closed: false,
      replayCutoff: "0-0",
      replayEntries: [],
      teamIds: [],
      userId: "user-1",
      workspaceId: "workspace-1",
    } as WorkspaceSocketData
    const behavior = createWorkspaceSocketBehavior({
      addConnectedUser,
      counters: createRealtimeServerCounters(),
      delivery: {
        addWorkspaceSocket: () => true,
        replayWorkspaceSocket: () => true,
        sendCursor: () => {
          socketData.closed = true
        },
        subscribeWorkspaceSocket: () => undefined,
      } as never,
      jitteredConnectionLifetimeMs: () => 1,
      logTokenRejection: () => undefined,
      maxConnections: 10,
      maxConnectionsPerWorkspace: 10,
      redis: {} as never,
      removeConnectedUser: () => undefined,
      secret: SECRET,
      state,
      streamReader: {
        getRecentEntries: () => [],
        getTaintedUpToId: () => undefined,
        hasRecentEntriesGap: () => false,
      } as never,
    })
    const socket = {
      end: () => undefined,
      getUserData: () => socketData,
      subscribe: () => undefined,
    }

    behavior.open?.(socket as never)

    expect(addConnectedUser).not.toHaveBeenCalled()
    expect(state.workspaceLifetimeTimers.has(socketData)).toBe(false)
  })

  test("releases a guest stream reference when an admitted upgrade aborts", async () => {
    const { promise: activation, resolve: resolveActivation } =
      Promise.withResolvers<string>()
    const releaseWorkspace = vi.fn()
    const streamReader = {
      activateWorkspace: vi.fn(() => activation),
      releaseWorkspace,
    } as never
    const state = createGatewayConnectionState<
      WorkspaceSocketData,
      GuestSocketData
    >()
    const behavior = createGuestSocketBehavior({
      counters: createRealtimeServerCounters(),
      delivery: {} as never,
      jitteredConnectionLifetimeMs: () => 1,
      logTokenRejection: () => undefined,
      maxConnections: 10,
      maxConnectionsPerGuest: 10,
      maxGuestConnections: 10,
      maxGuestConnectionsPerWorkspace: 10,
      secret: SECRET,
      state,
      streamReader,
    })
    const token = await signGuestConnectToken(
      { guestConversationId: "guest-1", workspaceId: "workspace-1" },
      SECRET,
    )
    const { abort, response } = createAbortedResponse()

    behavior.upgrade?.(response as never, guestRequest(token), {} as never)
    await vi.waitFor(() =>
      expect(streamReader.activateWorkspace).toHaveBeenCalledWith(
        "workspace-1",
      ),
    )
    abort()
    resolveActivation("0-0")

    await vi.waitFor(() => {
      expect(releaseWorkspace).toHaveBeenCalledWith("workspace-1")
      expect(state.pendingUpgrades).toBe(0)
      expect(state.pendingGuestUpgrades).toBe(0)
    })
  })
})
