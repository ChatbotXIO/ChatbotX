import {
  workspaceDeletionRecordDetailsSchema,
  workspaceDeletionRecordUsageSnapshotSchema,
} from "@chatbotx.io/database/schema"
import { describe, expect, test } from "vitest"

describe("workspace deletion record schemas", () => {
  test("round-trips ISO timestamps stored in JSON evidence", () => {
    const periodStart = "2026-10-01T00:00:00.000Z"
    const periodEnd = "2026-11-01T00:00:00.000Z"
    expect(
      workspaceDeletionRecordUsageSnapshotSchema.parse({
        botMessages: [],
        channels: 0,
        contacts: 0,
        mac: [{ count: 1, periodStart, periodEnd }],
        ownerQuota: null,
        teamMembers: 0,
      }).mac[0]?.periodStart,
    ).toBe(periodStart)
    expect(
      workspaceDeletionRecordDetailsSchema.parse({
        channels: [],
        members: [],
        owner: { email: null, id: "1", name: null, tenantId: null },
        plan: null,
        requestedBy: null,
        workspace: {
          createdAt: periodStart,
          id: "1",
          language: "en",
          logo: null,
          name: "A",
          timezone: "UTC",
        },
      }).workspace.createdAt,
    ).toBe(periodStart)
  })
})
