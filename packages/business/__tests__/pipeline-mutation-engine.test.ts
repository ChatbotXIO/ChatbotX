import type {
  PipelineItemModel,
  PipelineModel,
  PipelineStageModel,
} from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emitPipelineItemEvent: vi.fn(),
  queueWorkspaceRealtimeEvent: vi.fn(),
  assignByContactIds: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  acquirePipelineAdvisoryLock: vi.fn(),
  primaryFromSets: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("@chatbotx.io/events", () => ({
  emitPipelineItemEvent: mocks.emitPipelineItemEvent,
}))
vi.mock("../src/platform/realtime-broadcast", () => ({
  queueWorkspaceRealtimeEvent: mocks.queueWorkspaceRealtimeEvent,
}))
vi.mock("../src/conversation/service", () => ({
  conversationService: { assignByContactIds: mocks.assignByContactIds },
}))
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (run: (tx: object) => Promise<unknown>) => run({}),
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  acquirePipelineAdvisoryLock: mocks.acquirePipelineAdvisoryLock,
}))
vi.mock("../src/pipeline/item-assignees", () => ({
  currentAssignees: vi.fn(),
  primaryFromSets: mocks.primaryFromSets,
}))

const {
  activityRowsFromDiff,
  diffPipelineItem,
  dispatchPipelineEffects,
  effectsFromDiff,
  isEmptyDiff,
  realtimeEffect,
} = await import("../src/pipeline/mutation-engine")

const snapshot = {
  stageId: "s-1",
  status: "open" as const,
  priority: "medium" as const,
  value: 100,
  dueDate: null,
  title: "Deal",
  description: null,
  fieldValues: {},
}

const item = {
  ...snapshot,
  id: "i-1",
  workspaceId: "ws-1",
  pipelineId: "p-1",
  contactId: "c-1",
  number: 7,
} as PipelineItemModel

const pipeline = {
  id: "p-1",
  name: "Sales",
  referenceName: "sales",
  currency: "USD",
  settings: { statusLabels: { open: "Open", won: "Won", lost: "Lost" } },
} as PipelineModel

const stage = { id: "s-2", name: "Won stage" } as PipelineStageModel
const actor = { kind: "user" as const, userId: "u-1", sourceId: null }
const stageNames = new Map([
  ["s-1", "Lead"],
  ["s-2", "Won stage"],
])

describe("diffPipelineItem", () => {
  test("reports nothing when nothing changed", () => {
    expect(isEmptyDiff(diffPipelineItem(snapshot, { ...snapshot }))).toBe(true)
  })

  test("reports each changed attribute with from and to", () => {
    const diff = diffPipelineItem(snapshot, {
      ...snapshot,
      stageId: "s-2",
      status: "won",
      priority: "high",
      value: 250,
      title: "Bigger deal",
    })

    expect(diff.stage).toEqual({ from: "s-1", to: "s-2" })
    expect(diff.status).toEqual({ from: "open", to: "won" })
    expect(diff.priority).toEqual({ from: "medium", to: "high" })
    expect(diff.value).toEqual({ from: 100, to: 250 })
    expect(diff.title).toEqual({ from: "Deal", to: "Bigger deal" })
  })

  test("compares dates by instant and field values by content", () => {
    const due = new Date("2026-10-25T00:00:00.000Z")
    const before = { ...snapshot, dueDate: due, fieldValues: { a: "1" } }

    expect(
      isEmptyDiff(
        diffPipelineItem(before, {
          ...before,
          dueDate: new Date(due.getTime()),
          fieldValues: { a: "1" },
        }),
      ),
    ).toBe(true)
    expect(
      diffPipelineItem(before, { ...before, fieldValues: { a: "2" } })
        .fieldValues,
    ).toBe(true)
    expect(
      diffPipelineItem(before, { ...before, dueDate: null }).dueDate,
    ).toEqual({
      from: due,
      to: null,
    })
  })

  test("a value cleared to null is a change", () => {
    expect(
      diffPipelineItem(snapshot, { ...snapshot, value: null }).value,
    ).toEqual({ from: 100, to: null })
  })
})

describe("activityRowsFromDiff", () => {
  const now = new Date("2026-10-25T10:00:00.000Z")

  test("writes one row per changed attribute", () => {
    const diff = diffPipelineItem(snapshot, {
      ...snapshot,
      stageId: "s-2",
      priority: "high",
    })

    const rows = activityRowsFromDiff(diff, { item, actor, now })

    expect(rows.map((row) => row.kind).sort()).toEqual([
      "priorityChanged",
      "stageChanged",
    ])
    expect(
      rows.every((row) => row.itemNumber === 7 && row.actorUserId === "u-1"),
    ).toBe(true)
  })

  test("a status change records the value at closure for analytics", () => {
    const diff = diffPipelineItem(snapshot, { ...snapshot, status: "won" })

    const [row] = activityRowsFromDiff(diff, {
      item: { ...item, status: "won", value: 480 },
      actor,
      now,
    })

    expect(row).toMatchObject({
      kind: "statusChanged",
      fromStatus: "open",
      toStatus: "won",
      toValue: 480,
    })
  })

  test("does not store description or field bodies", () => {
    const diff = diffPipelineItem(snapshot, {
      ...snapshot,
      description: "secret text",
      fieldValues: { a: "private" },
    })

    const rows = activityRowsFromDiff(diff, { item, actor, now })

    expect(JSON.stringify(rows)).not.toContain("secret text")
    expect(JSON.stringify(rows)).not.toContain("private")
    expect(rows.map((row) => row.kind).sort()).toEqual([
      "descriptionChanged",
      "fieldValuesChanged",
    ])
  })
})

describe("effectsFromDiff", () => {
  const subject = { pipeline, stage, item, actor, stageNames }

  test("emits one event per changed event-bearing attribute", () => {
    const effects = effectsFromDiff(
      diffPipelineItem(snapshot, {
        ...snapshot,
        stageId: "s-2",
        value: 5,
        priority: "low",
        status: "lost",
      }),
      subject,
    )

    const events = effects.flatMap((effect) =>
      effect.kind === "event" ? [effect.eventType] : [],
    )
    expect(events.sort()).toEqual([
      "pipelineItemMovedToStage",
      "pipelineItemPriorityChanged",
      "pipelineItemStatusChanged",
      "pipelineItemValueChanged",
    ])
  })

  test("a title-only change emits no trigger event but still refreshes the board", () => {
    const effects = effectsFromDiff(
      diffPipelineItem(snapshot, { ...snapshot, title: "Renamed" }),
      subject,
    )

    expect(effects.map((effect) => effect.kind)).toEqual(["realtime"])
  })

  test("an unchanged item emits nothing", () => {
    expect(effectsFromDiff({}, subject)).toEqual([])
  })

  test("the moved event names the previous stage and the pipeline as source", () => {
    const [moved] = effectsFromDiff(
      diffPipelineItem(snapshot, { ...snapshot, stageId: "s-2" }),
      subject,
    )

    expect(moved).toMatchObject({
      kind: "event",
      eventType: "pipelineItemMovedToStage",
      metadata: {
        sourceId: "p-1",
        pipelineReferenceName: "sales",
        fromStageId: "s-1",
        fromStageName: "Lead",
        stageName: "Won stage",
        statusLabel: "Open",
      },
    })
  })
})

describe("dispatchPipelineEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("runs effects in order", async () => {
    const order: string[] = []
    mocks.emitPipelineItemEvent.mockImplementation(() => {
      order.push("event")
      return Promise.resolve()
    })
    mocks.queueWorkspaceRealtimeEvent.mockImplementation(() => {
      order.push("realtime")
      return Promise.resolve()
    })

    await dispatchPipelineEffects(
      effectsFromDiff(
        diffPipelineItem(snapshot, { ...snapshot, stageId: "s-2" }),
        { pipeline, stage, item, actor, stageNames },
      ),
    )

    expect(order).toEqual(["event", "realtime"])
  })

  test("a failing effect is swallowed and the next one still runs", async () => {
    mocks.emitPipelineItemEvent.mockRejectedValue(new Error("queue down"))

    await expect(
      dispatchPipelineEffects(
        effectsFromDiff(
          diffPipelineItem(snapshot, { ...snapshot, stageId: "s-2" }),
          { pipeline, stage, item, actor, stageNames },
        ),
      ),
    ).resolves.toBeUndefined()
    expect(mocks.queueWorkspaceRealtimeEvent).toHaveBeenCalledTimes(1)
  })

  test("an assignContact effect asks the conversation service to follow the assignee", async () => {
    mocks.primaryFromSets.mockResolvedValue("u_9")
    await dispatchPipelineEffects([
      {
        kind: "assignContact",
        workspaceId: "ws-1",
        contactId: "c-1",
        pipelineId: "p-1",
        itemId: "i-1",
        assignedId: "u_9",
        previousAssignedId: null,
      },
    ])

    expect(mocks.assignByContactIds).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactIds: ["c-1"],
        assignedId: "u_9",
        onlyFromAssignees: [null, null],
      }),
    )
    expect(mocks.acquirePipelineAdvisoryLock).toHaveBeenCalledWith(
      {},
      "pipeline-assign-contact:ws-1:c-1",
    )
  })

  test("a late effect moves the conversation to the item's current primary", async () => {
    // A→B then B→C committed before either effect ran; the item is now on C.
    mocks.primaryFromSets.mockResolvedValue("u_c")
    const effect = (previousAssignedId: string, assignedId: string) => ({
      kind: "assignContact" as const,
      workspaceId: "ws-1",
      contactId: "c-1",
      pipelineId: "p-1",
      itemId: "i-1",
      assignedId,
      previousAssignedId,
    })

    await dispatchPipelineEffects([effect("u_b", "u_c"), effect("u_a", "u_b")])

    // Whatever runs first, each call targets C and accepts its own transition,
    // so a conversation on A (via the A→B effect) still ends on C.
    expect(mocks.assignByContactIds).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        assignedId: "u_c",
        onlyFromAssignees: [null, "u_b"],
      }),
    )
    expect(mocks.assignByContactIds).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        assignedId: "u_c",
        onlyFromAssignees: [null, "u_a", "u_b"],
      }),
    )
  })

  test("the conversation update shares the effect's transaction and notifies after it", async () => {
    mocks.primaryFromSets.mockResolvedValue("u_9")
    const notify = vi.fn().mockResolvedValue(undefined)
    mocks.assignByContactIds.mockImplementationOnce(
      (props: { afterCommit: (callback: () => Promise<void>) => void }) => {
        props.afterCommit(notify)
        // Queued, not run, while the transaction is still open.
        expect(notify).not.toHaveBeenCalled()
        return Promise.resolve()
      },
    )

    await dispatchPipelineEffects([
      {
        kind: "assignContact",
        workspaceId: "ws-1",
        contactId: "c-1",
        pipelineId: "p-1",
        itemId: "i-1",
        assignedId: "u_9",
        previousAssignedId: null,
      },
    ])

    expect(mocks.assignByContactIds).toHaveBeenCalledWith(
      expect.objectContaining({ tx: {} }),
    )
    expect(notify).toHaveBeenCalledTimes(1)
  })

  test("an assignContact effect does nothing once the item has no primary", async () => {
    mocks.primaryFromSets.mockResolvedValue(null)
    await dispatchPipelineEffects([
      {
        kind: "assignContact",
        workspaceId: "ws-1",
        contactId: "c-1",
        pipelineId: "p-1",
        itemId: "i-1",
        assignedId: "u_9",
        previousAssignedId: null,
      },
    ])

    expect(mocks.assignByContactIds).not.toHaveBeenCalled()
  })
})

describe("realtime effects and count invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("an item effect carries its contact; a pipeline-wide one does not", () => {
    expect(
      realtimeEffect(
        { workspaceId: "w", pipelineId: "p", id: "i", contactId: "c" },
        "updated",
      ),
    ).toMatchObject({
      data: { pipelineId: "p", itemId: "i", contactId: "c", change: "updated" },
    })
    expect(
      realtimeEffect({ workspaceId: "w", pipelineId: "p" }, "bulk").kind,
    ).toBe("realtime")
    expect(
      realtimeEffect({ workspaceId: "w", pipelineId: "p" }, "bulk"),
    ).not.toHaveProperty("data.contactId")
  })

  test("adding or removing items drops the counts cache once per workspace", async () => {
    await dispatchPipelineEffects([
      realtimeEffect({ workspaceId: "w", pipelineId: "p", id: "1" }, "deleted"),
      realtimeEffect({ workspaceId: "w", pipelineId: "q", id: "1" }, "created"),
    ])

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "pipelines:w:counts",
    ])
  })

  test("edits and moves keep the counts cache", async () => {
    await dispatchPipelineEffects([
      realtimeEffect({ workspaceId: "w", pipelineId: "p", id: "1" }, "updated"),
      realtimeEffect({ workspaceId: "w", pipelineId: "p", id: "1" }, "moved"),
    ])

    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })
})
