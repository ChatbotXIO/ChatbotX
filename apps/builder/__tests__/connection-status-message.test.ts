import { connectionStatusReasons } from "@chatbotx.io/utils/connection"
import { describe, expect, test } from "vitest"
import {
  CONNECTION_STATUS_REASON_MESSAGE_KEYS,
  resolveConnectionStatusNotice,
} from "@/features/connections/lib/status-message"

describe("resolveConnectionStatusNotice", () => {
  test("a healthy connection has no notice", () => {
    expect(
      resolveConnectionStatusNotice({
        status: "connected",
        statusReason: null,
      }),
    ).toBeNull()
    expect(resolveConnectionStatusNotice(null)).toBeNull()
    expect(resolveConnectionStatusNotice(undefined)).toBeNull()
  })

  test("an offboarded connection says it is reconnecting and offers no action", () => {
    expect(
      resolveConnectionStatusNotice({
        status: "degraded",
        statusReason: "provider_offboarded",
      }),
    ).toEqual({
      messageKey: "connectionStatus.reconnecting",
      canReconnect: false,
    })
  })

  test("a revoked connection explains the removal and offers Reconnect", () => {
    expect(
      resolveConnectionStatusNotice({
        status: "needs_reauth",
        statusReason: "provider_revoked",
      }),
    ).toEqual({
      messageKey: "connectionStatus.accessRemoved",
      canReconnect: true,
    })
  })

  test("a degraded connection that is not an offboard offers Reconnect", () => {
    expect(
      resolveConnectionStatusNotice({
        status: "degraded",
        statusReason: "refresh_failed",
      }),
    ).toEqual({
      messageKey: "connectionStatus.needsReconnect",
      canReconnect: true,
    })
  })

  test("a paused or disconnected connection is not offered Reconnect", () => {
    expect(
      resolveConnectionStatusNotice({
        status: "paused",
        statusReason: "trial_expired",
      })?.canReconnect,
    ).toBe(false)
  })

  test("every connection status reason has a message", () => {
    for (const reason of connectionStatusReasons.options) {
      expect(
        CONNECTION_STATUS_REASON_MESSAGE_KEYS[reason].startsWith(
          "connectionStatus.",
        ),
      ).toBe(true)
    }
  })
})
