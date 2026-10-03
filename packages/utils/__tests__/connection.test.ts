import { describe, expect, test } from "vitest"
import {
  ACTIVE_CONNECT_SESSION_STATUSES,
  ACTIVE_CONNECTION_STATUSES,
  CONNECTION_TO_INBOX_DISCONNECT_REASON,
  connectionStatuses,
  connectionStatusReasons,
  connectSessionNextActionSchema,
  connectSessionStatuses,
  INACTIVE_CONNECTION_STATUSES,
  TERMINAL_CONNECT_SESSION_STATUSES,
} from "../src/connection"

describe("CONNECTION_TO_INBOX_DISCONNECT_REASON", () => {
  test("maps every connection status reason", () => {
    expect(Object.keys(CONNECTION_TO_INBOX_DISCONNECT_REASON).sort()).toEqual(
      [...connectionStatusReasons.options].sort(),
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
