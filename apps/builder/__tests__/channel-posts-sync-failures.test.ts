import { describe, expect, test } from "vitest"
import { failedConnectedSyncs } from "@/features/channel-posts/lib/sync-failures"

const item = (inboxId: string, status: string) => ({
  inboxId,
  inboxName: `Inbox ${inboxId}`,
  lastErrorCategory: null as string | null,
  status,
})

describe("failedConnectedSyncs", () => {
  test("lists only failed syncs of connected inboxes, in order", () => {
    const failures = failedConnectedSyncs(
      [
        item("1", "failed"),
        item("2", "failed"),
        item("3", "idle"),
        item("4", "failed"),
        item("5", "failed"),
      ],
      [
        { id: "1", status: "connected" },
        { id: "2", status: "disconnected" },
        { id: "3", status: "connected" },
        { id: "5", status: "connected" },
      ],
    )

    expect(failures.map((failure) => failure.inboxId)).toEqual(["1", "5"])
  })

  test("lists nothing before the inbox list is known", () => {
    expect(failedConnectedSyncs([item("1", "failed")], [])).toEqual([])
  })
})

describe("failedConnectedSyncs by category", () => {
  const failed = (inboxId: string, lastErrorCategory: string | null) => ({
    ...item(inboxId, "failed"),
    lastErrorCategory,
  })
  const connected = ["1", "2", "3", "4", "5"].map((id) => ({
    id,
    status: "connected",
  }))

  test("picks the action from the category", () => {
    const failures = failedConnectedSyncs(
      [
        failed("1", "auth_failed"),
        failed("2", "permission_denied"),
        failed("3", "payload_invalid"),
        failed("4", null),
      ],
      connected,
    )

    expect(failures.map((failure) => failure.action)).toEqual([
      "reconnect",
      "reconnectWithPermission",
      "retry",
      "retry",
    ])
  })

  test("never lists a notConnected, idle or queued row", () => {
    const failures = failedConnectedSyncs(
      [
        failed("1", "notConnected"),
        { ...item("2", "idle"), lastErrorCategory: "auth_failed" },
        { ...item("3", "queued"), lastErrorCategory: null },
        failed("5", "auth_failed"),
      ],
      connected,
    )

    expect(failures.map((failure) => failure.inboxId)).toEqual(["5"])
  })
})
