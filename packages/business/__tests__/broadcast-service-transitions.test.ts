import { beforeEach, describe, expect, test, vi } from "vitest"

const updateReturning = vi.fn()
const updateWhere = vi.fn()
const findFirstBroadcast = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      broadcastModel: {
        findMany: vi.fn(),
        findFirst: (...args: unknown[]) => findFirstBroadcast(...args),
      },
    },
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          updateWhere({ table, values, condition })
          return {
            returning: () => updateReturning({ table, values, condition }),
          }
        },
      }),
    }),
  },
  and: (...args: unknown[]) => ({ __and: args }),
  asc: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  gt: vi.fn(),
  inArray: (a: unknown, b: unknown) => ({ __inArray: [a, b] }),
  isNotNull: (a: unknown) => ({ __isNotNull: a }),
  isNull: (a: unknown) => ({ __isNull: a }),
  ne: (a: unknown, b: unknown) => ({ __ne: [a, b] }),
  or: (...args: unknown[]) => ({ __or: args }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: { strings: [...strings], values },
    }),
    { raw: vi.fn() },
  ),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  broadcastStatuses: {
    enum: {
      scheduled: "scheduled",
      sent: "sent",
      sending: "sending",
      cancelled: "cancelled",
      draft: "draft",
      failed: "failed",
    },
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {
    id: "broadcast.id",
    workspaceId: "broadcast.workspaceId",
    status: "broadcast.status",
    contactCount: "broadcast.contactCount",
    handoffCompletedAt: "broadcast.handoffCompletedAt",
    resumeCount: "broadcast.resumeCount",
    deletedAt: "broadcast.deletedAt",
  },
  contactsOnBroadcastsModel: {
    broadcastId: "cob.broadcastId",
    contactId: "cob.contactId",
    contactInboxId: "cob.contactInboxId",
    sent: "cob.sent",
    failedAt: "cob.failedAt",
  },
  contactInboxModel: {},
  contactModel: {},
  conversationModel: {},
  integrationMessengerModel: {},
  integrationWhatsappModel: {},
  messengerMessageTemplateModel: {},
  whatsappMessageTemplateModel: {},
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactInboxContactFilterSQL: vi.fn(),
  contactInboxInteractedWithin24hSQL: vi.fn(),
  pruneEmailPhoneFilterConditions: vi.fn(),
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: vi.fn(),
  likeContains: (value: string) => `%${value}%`,
}))

vi.mock("../src/inbox/service", () => ({ inboxService: {} }))

const { broadcastService } = await import("../src/broadcast/service")

const flatten = (condition: unknown): unknown[] => {
  const c = condition as { __and?: unknown[]; __or?: unknown[] }
  if (c.__and) {
    return c.__and.flatMap(flatten)
  }
  if (c.__or) {
    return c.__or.flatMap(flatten)
  }
  return [condition]
}

beforeEach(() => {
  updateReturning.mockReset()
  updateWhere.mockReset()
  findFirstBroadcast.mockReset()
})

describe("broadcastService.moveToDraft", () => {
  test("moves a scheduled broadcast back to draft, clearing contactCount/handoffCompletedAt and bumping resumeCount", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    const result = await broadcastService.moveToDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
    })

    expect(result).toEqual({ id: "b-1" })
    const { values, condition } = updateReturning.mock.calls[0][0]
    expect(values.status).toBe("draft")
    expect(values.contactCount).toBeNull()
    expect(values.handoffCompletedAt).toBeNull()
    // Discriminates `resumeCount + 1` from a `- 1` (or any other) regression:
    // the sql fragment must interpolate the resumeCount column and literally
    // append " + 1" in its raw template text.
    expect(values.resumeCount).toEqual({
      __sql: {
        strings: ["", " + 1"],
        values: ["broadcast.resumeCount"],
      },
    })
    expect(flatten(condition)).toEqual([
      { __eq: ["broadcast.id", "b-1"] },
      { __eq: ["broadcast.workspaceId", "ws-1"] },
      { __eq: ["broadcast.status", "scheduled"] },
      { __isNull: "broadcast.deletedAt" },
    ])
  })

  test("throws when the broadcast is no longer scheduled", async () => {
    updateReturning.mockResolvedValue([])

    await expect(
      broadcastService.moveToDraft({ workspaceId: "ws-1", broadcastId: "b-1" }),
    ).rejects.toThrow("Broadcast is no longer scheduled")
  })
})

describe("broadcastService.stopSending", () => {
  test("cancels a sending broadcast", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    const result = await broadcastService.stopSending({
      workspaceId: "ws-1",
      broadcastId: "b-1",
    })

    expect(result).toEqual({ id: "b-1" })
    const { values, condition } = updateReturning.mock.calls[0][0]
    expect(values).toEqual({ status: "cancelled" })
    expect(flatten(condition)).toEqual([
      { __eq: ["broadcast.id", "b-1"] },
      { __eq: ["broadcast.workspaceId", "ws-1"] },
      { __eq: ["broadcast.status", "sending"] },
      { __isNull: "broadcast.deletedAt" },
    ])
  })

  test("throws when the broadcast is not in progress", async () => {
    updateReturning.mockResolvedValue([])

    await expect(
      broadcastService.stopSending({ workspaceId: "ws-1", broadcastId: "b-1" }),
    ).rejects.toThrow("Broadcast is not in progress")
  })
})

describe("broadcastService.resumeSending", () => {
  test("resumes a cancelled broadcast, clears handoffCompletedAt, and bumps resumeCount in one UPDATE", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    const result = await broadcastService.resumeSending({
      workspaceId: "ws-1",
      broadcastId: "b-1",
    })

    expect(result).toEqual({ id: "b-1" })
    const { values, condition } = updateReturning.mock.calls[0][0]
    expect(values.status).toBe("sending")
    expect(values.handoffCompletedAt).toBeNull()
    // Same discrimination as moveToDraft: must be `resumeCount + 1`, not any
    // sql fragment (a `- 1` regression would otherwise pass silently).
    expect(values.resumeCount).toEqual({
      __sql: {
        strings: ["", " + 1"],
        values: ["broadcast.resumeCount"],
      },
    })
    expect(flatten(condition)).toEqual([
      { __eq: ["broadcast.id", "b-1"] },
      { __eq: ["broadcast.workspaceId", "ws-1"] },
      { __eq: ["broadcast.status", "cancelled"] },
      { __isNull: "broadcast.deletedAt" },
      { __isNotNull: "broadcast.contactCount" },
    ])
    // A single pinned UPDATE — not a read-then-write — closes both the
    // stop-after-handoff hole and the finalize race.
    expect(updateReturning).toHaveBeenCalledTimes(1)
  })

  test("throws when the broadcast is not stopped", async () => {
    updateReturning.mockResolvedValue([])

    await expect(
      broadcastService.resumeSending({
        workspaceId: "ws-1",
        broadcastId: "b-1",
      }),
    ).rejects.toThrow("Broadcast is not stopped")
  })

  // I-1: campaign-cleanup.ts cancels `scheduled` broadcasts at workspace
  // teardown, leaving `contactCount = null` and no recipient rows. Without
  // the `isNotNull(contactCount)` guard, resuming one flips it straight to
  // `sent` with zero deliveries — the WHERE-clause shape above already
  // proves the guard is wired in; this proves the 0-row path still throws
  // the same "not stopped" error a never-prepared cancelled row hits.
  test("throws the same 'not stopped' error for a never-prepared cancelled broadcast (contactCount null)", async () => {
    updateReturning.mockResolvedValue([])

    await expect(
      broadcastService.resumeSending({
        workspaceId: "ws-1",
        broadcastId: "b-never-prepared",
      }),
    ).rejects.toThrow("Broadcast is not stopped")
    const { condition } = updateReturning.mock.calls[0][0]
    expect(flatten(condition)).toContainEqual({
      __isNotNull: "broadcast.contactCount",
    })
  })
})

describe("broadcastService.softDeleteBroadcasts", () => {
  test("soft-deletes the requested ids that are not currently sending", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1" }, { id: "b-2" }])

    const result = await broadcastService.softDeleteBroadcasts({
      workspaceId: "ws-1",
      ids: ["b-1", "b-2", "b-3"],
    })

    expect(result).toEqual({ deletedCount: 2, requestedCount: 3 })
    const { values, condition } = updateReturning.mock.calls[0][0]
    expect(values.deletedAt).toBeInstanceOf(Date)
    expect(flatten(condition)).toEqual([
      { __eq: ["broadcast.workspaceId", "ws-1"] },
      { __inArray: ["broadcast.id", ["b-1", "b-2", "b-3"]] },
      { __ne: ["broadcast.status", "sending"] },
      { __isNull: "broadcast.deletedAt" },
    ])
  })

  test("returns zero counts and skips the query when ids is empty", async () => {
    const result = await broadcastService.softDeleteBroadcasts({
      workspaceId: "ws-1",
      ids: [],
    })

    expect(result).toEqual({ deletedCount: 0, requestedCount: 0 })
    expect(updateReturning).not.toHaveBeenCalled()
  })
})

describe("broadcastService.resetContactForResume", () => {
  test("resets sent=false scoped by contactId, excluding failed rows", async () => {
    await broadcastService.resetContactForResume({
      broadcastId: "b-1",
      contactKey: { contactId: "contact-1" },
    })

    const { values, condition } = updateWhere.mock.calls[0][0]
    expect(values).toEqual({ sent: false })
    expect(flatten(condition)).toEqual([
      { __eq: ["cob.broadcastId", "b-1"] },
      { __eq: ["cob.contactId", "contact-1"] },
      { __isNull: "cob.failedAt" },
    ])
  })

  test("resets sent=false scoped by contactInboxId when that key is provided instead", async () => {
    await broadcastService.resetContactForResume({
      broadcastId: "b-1",
      contactKey: { contactInboxId: "ci-1" },
    })

    const { condition } = updateWhere.mock.calls[0][0]
    expect(flatten(condition)).toEqual([
      { __eq: ["cob.broadcastId", "b-1"] },
      { __eq: ["cob.contactInboxId", "ci-1"] },
      { __isNull: "cob.failedAt" },
    ])
  })
})

describe("broadcastService.findSendableBroadcast", () => {
  test("reads by id scoped to status='sending' and deletedAt IS NULL", async () => {
    findFirstBroadcast.mockResolvedValue({ id: "b-1" })

    const result = await broadcastService.findSendableBroadcast("b-1")

    expect(result).toEqual({ id: "b-1" })
    expect(findFirstBroadcast).toHaveBeenCalledWith({
      where: {
        id: "b-1",
        status: "sending",
        deletedAt: { isNull: true },
      },
      columns: { id: true },
    })
  })

  test("returns null when the broadcast is not sendable (stopped, deleted, or unknown)", async () => {
    findFirstBroadcast.mockResolvedValue(undefined)

    const result = await broadcastService.findSendableBroadcast("b-1")

    expect(result).toBeNull()
  })
})

describe("broadcastService.markContactSentIfSending", () => {
  test("marks sent=true conditioned on the broadcast still being sending", async () => {
    await broadcastService.markContactSentIfSending({
      broadcastId: "b-1",
      contactId: "contact-1",
    })

    const { values, condition } = updateWhere.mock.calls[0][0]
    expect(values).toEqual({ sent: true })
    const parts = flatten(condition)
    expect(parts).toContainEqual({ __eq: ["cob.broadcastId", "b-1"] })
    expect(parts).toContainEqual({ __eq: ["cob.contactId", "contact-1"] })
    // The EXISTS guard is a raw sql fragment. Assert it actually targets the
    // "Broadcast" table, pins status='sending' in its raw text, and carries
    // the bound broadcastId + status as interpolated values — not just that
    // *some* sql fragment is present.
    const existsPart = parts.find(
      (part): part is { __sql: { strings: string[]; values: unknown[] } } =>
        typeof part === "object" && part !== null && "__sql" in part,
    )
    expect(existsPart).toBeDefined()
    const { strings, values: sqlValues } = existsPart?.__sql ?? {
      strings: [],
      values: [],
    }
    expect(strings.join("")).toContain('FROM "Broadcast" b')
    expect(strings.join("")).toContain("b.id =")
    expect(strings.join("")).toContain("b.status =")
    expect(sqlValues).toEqual(["b-1", "sending"])
  })
})
