// @vitest-environment node

/**
 * Real-database checks for the Pipelines flow step (all 14 actions through
 * `runPipelineFlowAction`), the events each mutation emits, and the rows the
 * `{{pipelines.*}}` / `{{last_opportunity_id}}` variables read. Runs only
 * against an explicitly configured local database.
 */

import { db, eq } from "@chatbotx.io/database/client"
import { pipelineItemRepository } from "@chatbotx.io/database/repositories"
import {
  contactCustomFieldModel,
  contactModel,
  customFieldModel,
  inboxTeamModel,
  pipelineItemAssigneeModel,
  userModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import {
  type PipelineStepAction,
  type PipelineStepSchema,
  pipelineStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const realDatabaseUrl = (): string | null => {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === "1" ? null : url
  } catch {
    return null
  }
}

const mocks = vi.hoisted(() => ({
  emitPipelineItemEvent: vi.fn(),
  queueWorkspaceRealtimeEvent: vi.fn(),
  assignByContactIds: vi.fn(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitPipelineItemEvent: mocks.emitPipelineItemEvent,
}))
vi.mock("../../src/platform/realtime-broadcast", () => ({
  queueWorkspaceRealtimeEvent: mocks.queueWorkspaceRealtimeEvent,
}))
vi.mock("../../src/conversation/service", () => ({
  conversationService: {
    assignByContactIds: mocks.assignByContactIds,
    findDMByContactIds: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock("../../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: (_key: string, fn: () => Promise<unknown>) => fn(),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../src/ecommerce-settings/service", () => ({
  ecommerceSettingsService: {
    get: vi.fn().mockResolvedValue({ payments: { currency: "VND" } }),
  },
}))

const { pipelineService } = await import("../../src/pipeline/service")
const { pipelineItemService } = await import("../../src/pipeline/item.service")
const { pipelineStructureService } = await import(
  "../../src/pipeline/pipeline-structure.service"
)
const { pipelineItemQueryService } = await import(
  "../../src/pipeline/item-query.service"
)
const { runPipelineFlowAction } = await import(
  "../../src/pipeline/flow-actions"
)
const { loadLastPipelineItemId, loadPipelineVariableTargets } = await import(
  "../../src/pipeline/variable-targets"
)

type Fixture = {
  userId: string
  workspaceId: string
  memberId: string
  contactIds: string[]
  teamId: string
}

const token = { kind: "workspaceToken" } as const
const actor = { kind: "user", userId: null, sourceId: null } as const
const FOREIGN_ID = "999999999999"

describe.skipIf(!realDatabaseUrl())("pipeline automation", () => {
  let own: Fixture
  let other: Fixture

  const createFixture = async (label: string): Promise<Fixture> => {
    const suffix = `${label}-${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(userModel)
      .values({ email: `pipeline-auto-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `pipeline-auto-${suffix}`, ownerId: user.id })
      .returning({ id: workspaceModel.id })
    const [member] = await db
      .insert(workspaceMemberModel)
      .values({ workspaceId: workspace.id, userId: user.id, role: "owner" })
      .returning({ id: workspaceMemberModel.id })
    const contacts = await db
      .insert(contactModel)
      .values([{ workspaceId: workspace.id }, { workspaceId: workspace.id }])
      .returning({ id: contactModel.id })
    const [team] = await db
      .insert(inboxTeamModel)
      .values({ workspaceId: workspace.id, name: "Support" })
      .returning({ id: inboxTeamModel.id })
    return {
      userId: user.id,
      workspaceId: workspace.id,
      memberId: member.id,
      contactIds: contacts.map((contact) => contact.id),
      teamId: team.id,
    }
  }

  const cleanup = async (fixture: Fixture | undefined) => {
    if (!fixture) {
      return
    }
    await db
      .delete(workspaceModel)
      .where(eq(workspaceModel.id, fixture.workspaceId))
    await db.delete(userModel).where(eq(userModel.id, fixture.userId))
  }

  const newPipeline = async (name = "Sales") =>
    await pipelineService.create({
      workspaceId: own.workspaceId,
      type: "opportunity",
      name,
      scope: token,
      actor,
    })

  const newField = async (
    pipelineId: string,
    referenceName: string,
    required = false,
  ) =>
    await pipelineStructureService.createField({
      workspaceId: own.workspaceId,
      pipelineId,
      scope: token,
      values: {
        name: referenceName,
        referenceName,
        type: "shortText",
        required,
      },
    })

  const stepFor = (
    action: PipelineStepAction,
    pipelineId: string,
    overrides: Record<string, unknown> = {},
  ): PipelineStepSchema =>
    ({
      ...pipelineStepDefaultFn(action, { id: "77", pipelineId }),
      ...overrides,
    }) as PipelineStepSchema

  const run = async (
    step: PipelineStepSchema,
    options: {
      contactId?: string
      flowExecutionKey?: string
      workspaceId?: string
      interpolate?: (text: string) => Promise<string>
    } = {},
  ) =>
    await runPipelineFlowAction(step, {
      workspaceId: options.workspaceId ?? own.workspaceId,
      contactId: options.contactId ?? own.contactIds[0],
      flowId: "555",
      flowExecutionKey: options.flowExecutionKey,
      interpolate: options.interpolate ?? (async (text) => text),
    })

  const itemsOf = async (pipelineId: string, contactId = own.contactIds[0]) =>
    (
      await pipelineItemQueryService.listItems({
        workspaceId: own.workspaceId,
        pipelineId,
        scope: token,
        limit: 50,
      })
    ).items
      .map((view) => view.item)
      .filter((item) => item.contactId === contactId)

  const itemRow = async (pipelineId: string, itemId: string) => {
    const row = await pipelineItemRepository.findById({
      workspaceId: own.workspaceId,
      pipelineId,
      id: itemId,
    })
    if (!row) {
      throw new Error("item missing")
    }
    return row
  }

  const eventTypes = () =>
    mocks.emitPipelineItemEvent.mock.calls.map(([type]) => type)

  /** Adds an open item through the flow action and returns it. */
  const seed = async (
    pipelineId: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const result = await run(
      stepFor("addToPipeline", pipelineId, { title: "Deal", ...overrides }),
    )
    expect(result.status).toBe("success")
    const [item] = await itemsOf(pipelineId)
    mocks.emitPipelineItemEvent.mockClear()
    return item
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    own = await createFixture("own")
    other = await createFixture("other")
  })

  afterEach(async () => {
    await cleanup(own)
    await cleanup(other)
  })

  describe("addToPipeline", () => {
    test("creates an item with fields, assignees and a fixed due date, emitting created once", async () => {
      const pipeline = await newPipeline()
      const field = await newField(pipeline.id, "plan")
      const result = await run(
        stepFor("addToPipeline", pipeline.id, {
          title: "Hello {{name}}",
          description: "desc",
          assigneeMemberIds: [own.memberId],
          assigneeInboxTeamIds: [own.teamId],
          fieldValues: [{ pipelineFieldId: field.id, value: "gold {{name}}" }],
          dueDate: { mode: "fixed", at: "2030-01-02T03:04:05.000Z" },
        }),
        { interpolate: async (text) => text.replace("{{name}}", "Ann") },
      )

      expect(result).toEqual({ status: "success" })
      const [item] = await itemsOf(pipeline.id)
      expect(item.title).toBe("Hello Ann")
      expect(item.description).toBe("desc")
      expect(item.dueDate?.toISOString()).toBe("2030-01-02T03:04:05.000Z")
      expect(item.fieldValues).toEqual({ [field.id]: "gold Ann" })
      const assignees = await db
        .select()
        .from(pipelineItemAssigneeModel)
        .where(eq(pipelineItemAssigneeModel.itemId, item.id))
      expect(assignees).toHaveLength(2)
      expect(eventTypes()).toEqual(["pipelineItemCreated"])
      expect(mocks.emitPipelineItemEvent.mock.calls[0][3]).toMatchObject({
        sourceId: pipeline.id,
        pipelineId: pipeline.id,
        itemId: item.id,
        title: "Hello Ann",
        stageName: "Lead",
        status: "open",
      })
    })

    test("due date none leaves it empty; customField mode reads the contact's field", async () => {
      const pipeline = await newPipeline()
      expect((await run(stepFor("addToPipeline", pipeline.id))).status).toBe(
        "success",
      )
      expect((await itemsOf(pipeline.id))[0].dueDate).toBeNull()

      const [customField] = await db
        .insert(customFieldModel)
        .values({
          workspaceId: own.workspaceId,
          name: "Renewal",
          type: "date",
        })
        .returning({ id: customFieldModel.id })
      await db.insert(contactCustomFieldModel).values({
        contactId: own.contactIds[1],
        customFieldId: customField.id,
        value: "2031-05-06T00:00:00.000Z",
      })
      const dueDate = { mode: "customField", customFieldId: customField.id }
      expect(
        (
          await run(stepFor("addToPipeline", pipeline.id, { dueDate }), {
            contactId: own.contactIds[1],
          })
        ).status,
      ).toBe("success")
      const [item] = await itemsOf(pipeline.id, own.contactIds[1])
      expect(item.dueDate?.toISOString()).toBe("2031-05-06T00:00:00.000Z")
    })

    test("a blank or non-date contact field adds the item without a due date; changing to one is an error", async () => {
      const pipeline = await newPipeline()
      const [dateField] = await db
        .insert(customFieldModel)
        .values({ workspaceId: own.workspaceId, name: "D", type: "date" })
        .returning({ id: customFieldModel.id })
      const [textField] = await db
        .insert(customFieldModel)
        .values({ workspaceId: own.workspaceId, name: "T", type: "shortText" })
        .returning({ id: customFieldModel.id })

      const blank = await run(
        stepFor("addToPipeline", pipeline.id, {
          dueDate: { mode: "customField", customFieldId: dateField.id },
        }),
      )
      const wrongType = await run(
        stepFor("addToPipeline", pipeline.id, {
          dueDate: { mode: "customField", customFieldId: textField.id },
        }),
      )

      const changeToWrongType = await run(
        stepFor("changeDueDate", pipeline.id, {
          dueDate: { mode: "customField", customFieldId: textField.id },
        }),
      )

      expect(blank.status).toBe("success")
      // Adding still adds the item; only its due date is left empty.
      expect(wrongType.status).toBe("success")
      expect((await itemsOf(pipeline.id)).map((item) => item.dueDate)).toEqual([
        null,
        null,
      ])
      // Changing the due date fails instead of clearing it.
      expect(changeToWrongType.status).toBe("error")
    })

    test("a foreign pipeline is an error; foreign stage, field and admin ids are never used", async () => {
      const pipeline = await newPipeline()
      const foreign = await pipelineService.create({
        workspaceId: other.workspaceId,
        type: "opportunity",
        name: "Theirs",
        scope: token,
        actor,
      })
      const foreignStage = (
        await pipelineService.get({
          workspaceId: other.workspaceId,
          id: foreign.id,
          scope: token,
        })
      ).stages[0]
      const foreignField = await pipelineStructureService.createField({
        workspaceId: other.workspaceId,
        pipelineId: foreign.id,
        scope: token,
        values: {
          name: "x",
          referenceName: "x",
          type: "shortText",
          required: false,
        },
      })

      const results = await Promise.all([
        run(stepFor("addToPipeline", foreign.id)),
        run(
          stepFor("addToPipeline", pipeline.id, { stageId: foreignStage.id }),
        ),
        run(
          stepFor("addToPipeline", pipeline.id, {
            fieldValues: [{ pipelineFieldId: foreignField.id, value: "v" }],
          }),
        ),
        run(
          stepFor("addToPipeline", pipeline.id, {
            assigneeMemberIds: [other.memberId],
          }),
        ),
      ])

      // Another workspace's ids resolve like deleted ones: the step still adds
      // the item, and none of them reaches it.
      expect(results.map((r) => r.status)).toEqual([
        "error",
        "success",
        "success",
        "success",
      ])
      const items = await itemsOf(pipeline.id)
      const ownStageIds = (
        await pipelineService.get({
          workspaceId: own.workspaceId,
          id: pipeline.id,
          scope: token,
        })
      ).stages.map((stage) => stage.id)
      expect(items).toHaveLength(3)
      for (const item of items) {
        expect(ownStageIds).toContain(item.stageId)
        expect(item.fieldValues).not.toHaveProperty(foreignField.id)
      }
      const views = await Promise.all(
        items.map((item) =>
          pipelineItemQueryService.getItem({
            workspaceId: own.workspaceId,
            pipelineId: pipeline.id,
            itemId: item.id,
            scope: token,
          }),
        ),
      )
      for (const view of views) {
        expect(view.assignees.workspaceMemberIds).not.toContain(other.memberId)
      }
    })

    test("the per-contact open-item limit routes to error", async () => {
      const pipeline = await newPipeline()
      await pipelineService.update({
        workspaceId: own.workspaceId,
        id: pipeline.id,
        scope: token,
        values: {
          settings: { ...pipeline.settings, maxOpenItemsPerContact: 1 },
        },
      })

      const first = await run(stepFor("addToPipeline", pipeline.id))
      const second = await run(stepFor("addToPipeline", pipeline.id))

      expect(first.status).toBe("success")
      expect(second.status).toBe("error")
      expect(await itemsOf(pipeline.id)).toHaveLength(1)
    })

    test("a missing required pipeline field is an error", async () => {
      const pipeline = await newPipeline()
      await newField(pipeline.id, "must", true)

      expect((await run(stepFor("addToPipeline", pipeline.id))).status).toBe(
        "error",
      )
    })

    test("a retried step with the same flowExecutionKey creates one item and emits once", async () => {
      const pipeline = await newPipeline()
      const step = stepFor("addToPipeline", pipeline.id)

      await run(step, { flowExecutionKey: "exec-1" })
      await run(step, { flowExecutionKey: "exec-1" })

      expect(await itemsOf(pipeline.id)).toHaveLength(1)
      expect(eventTypes()).toEqual(["pipelineItemCreated"])
    })

    test("no pipeline selected or an unknown pipeline is an error", async () => {
      expect((await run(stepFor("addToPipeline", ""))).status).toBe("error")
      expect((await run(stepFor("addToPipeline", FOREIGN_ID))).status).toBe(
        "error",
      )
    })
  })

  describe("contact-scoped actions", () => {
    test("every action skips when the contact has no open item", async () => {
      const pipeline = await newPipeline()
      const stage = (
        await pipelineService.get({
          workspaceId: own.workspaceId,
          id: pipeline.id,
          scope: token,
        })
      ).stages[0]
      const actions: PipelineStepSchema[] = [
        stepFor("moveToStage", pipeline.id, { stageId: stage.id }),
        stepFor("changeValue", pipeline.id, { value: "5" }),
        stepFor("assign", pipeline.id, { assigneeMemberIds: [own.memberId] }),
        stepFor("changeStatus", pipeline.id, { status: "won" }),
        stepFor("changePriority", pipeline.id, { priority: "high" }),
        stepFor("changeDueDate", pipeline.id),
        stepFor("changeTitle", pipeline.id, { title: "x" }),
        stepFor("setCustomField", pipeline.id, { pipelineFieldId: "1" }),
        stepFor("clearCustomField", pipeline.id, { pipelineFieldIds: ["1"] }),
        stepFor("changeDescription", pipeline.id, { description: "d" }),
        stepFor("removeFromPipeline", pipeline.id),
        stepFor("addComment", pipeline.id, { text: "hi" }),
        stepFor("transfer", pipeline.id, {
          destinationPipelineId: pipeline.id,
        }),
      ]

      for (const step of actions) {
        expect(await run(step), step.action).toMatchObject({ status: "skip" })
      }
      expect(mocks.emitPipelineItemEvent).not.toHaveBeenCalled()
    })

    test("a closed item is not a target (skip)", async () => {
      const pipeline = await newPipeline()
      await seed(pipeline.id)
      await run(stepFor("changeStatus", pipeline.id, { status: "won" }))

      expect(
        (
          await run(
            stepFor("changePriority", pipeline.id, { priority: "high" }),
          )
        ).status,
      ).toBe("skip")
    })

    test("moveToStage moves and emits moved with the previous stage; foreign stage errors", async () => {
      const pipeline = await newPipeline()
      const stage = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Won",
      })
      const item = await seed(pipeline.id)

      const bad = await run(
        stepFor("moveToStage", pipeline.id, { stageId: FOREIGN_ID }),
      )
      const ok = await run(
        stepFor("moveToStage", pipeline.id, { stageId: stage.id }),
      )

      expect(bad.status).toBe("error")
      expect(ok.status).toBe("success")
      expect((await itemRow(pipeline.id, item.id)).stageId).toBe(stage.id)
      expect(eventTypes()).toEqual(["pipelineItemMovedToStage"])
      expect(mocks.emitPipelineItemEvent.mock.calls[0][3]).toMatchObject({
        fromStageName: "Lead",
        stageName: "Won",
        sourceId: pipeline.id,
      })
    })

    test("changeValue accepts valid values with interpolation and rejects negative or non-numeric", async () => {
      const pipeline = await newPipeline()
      const item = await seed(pipeline.id)

      const negative = await run(
        stepFor("changeValue", pipeline.id, { value: "-1" }),
      )
      const text = await run(
        stepFor("changeValue", pipeline.id, { value: "abc" }),
      )
      const empty = await run(
        stepFor("changeValue", pipeline.id, { value: "" }),
      )
      expect([negative.status, text.status, empty.status]).toEqual([
        "error",
        "error",
        "error",
      ])
      expect(mocks.emitPipelineItemEvent).not.toHaveBeenCalled()

      const ok = await run(
        stepFor("changeValue", pipeline.id, { value: "{{amount}}" }),
        { interpolate: async () => "1250.5" },
      )
      expect(ok.status).toBe("success")
      expect((await itemRow(pipeline.id, item.id)).value).toBe(1250.5)
      expect(eventTypes()).toEqual(["pipelineItemValueChanged"])
      expect(mocks.emitPipelineItemEvent.mock.calls[0][3]).toMatchObject({
        value: 1250.5,
        previousValue: null,
      })
    })

    test("assign sets members and teams, an empty list is an error and foreign members error", async () => {
      const pipeline = await newPipeline()
      const item = await seed(pipeline.id)

      const empty = await run(stepFor("assign", pipeline.id))
      const foreign = await run(
        stepFor("assign", pipeline.id, { assigneeMemberIds: [other.memberId] }),
      )
      const ok = await run(
        stepFor("assign", pipeline.id, {
          assigneeMemberIds: [own.memberId],
          assigneeInboxTeamIds: [own.teamId],
        }),
      )

      expect(empty.status).toBe("error")
      expect(foreign.status).toBe("error")
      expect(ok.status).toBe("success")
      const rows = await db
        .select()
        .from(pipelineItemAssigneeModel)
        .where(eq(pipelineItemAssigneeModel.itemId, item.id))
      expect(rows).toHaveLength(2)
    })

    test("changeStatus won, lost and reopen emit one status event each with the previous status", async () => {
      const pipeline = await newPipeline()
      const item = await seed(pipeline.id)

      await run(stepFor("changeStatus", pipeline.id, { status: "won" }))
      expect((await itemRow(pipeline.id, item.id)).closedAt).not.toBeNull()
      // A closed item is no longer a target, so reopen/lose go through the service.
      for (const status of ["lost", "open"] as const) {
        await pipelineItemService.update({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          fields: { status },
          scope: token,
          actor,
        })
      }

      expect(eventTypes()).toEqual([
        "pipelineItemStatusChanged",
        "pipelineItemStatusChanged",
        "pipelineItemStatusChanged",
      ])
      expect(
        mocks.emitPipelineItemEvent.mock.calls.map(
          ([, , , meta]) => `${meta.previousStatus}>${meta.status}`,
        ),
      ).toEqual(["open>won", "won>lost", "lost>open"])
      expect((await itemRow(pipeline.id, item.id)).closedAt).toBeNull()
    })

    test("changePriority emits priority changed once and a no-op emits nothing", async () => {
      const pipeline = await newPipeline()
      const item = await seed(pipeline.id)

      await run(stepFor("changePriority", pipeline.id, { priority: "high" }))
      await run(stepFor("changePriority", pipeline.id, { priority: "high" }))

      expect((await itemRow(pipeline.id, item.id)).priority).toBe("high")
      expect(eventTypes()).toEqual(["pipelineItemPriorityChanged"])
      expect(mocks.emitPipelineItemEvent.mock.calls[0][3]).toMatchObject({
        priority: "high",
        previousPriority: "medium",
      })
    })

    test("changeDueDate sets a fixed date, then clears it with none", async () => {
      const pipeline = await newPipeline()
      const item = await seed(pipeline.id)

      await run(
        stepFor("changeDueDate", pipeline.id, {
          dueDate: { mode: "fixed", at: "2032-02-03T00:00:00.000Z" },
        }),
      )
      expect((await itemRow(pipeline.id, item.id)).dueDate?.toISOString()).toBe(
        "2032-02-03T00:00:00.000Z",
      )
      await run(
        stepFor("changeDueDate", pipeline.id, { dueDate: { mode: "none" } }),
      )

      expect((await itemRow(pipeline.id, item.id)).dueDate).toBeNull()
      expect(mocks.emitPipelineItemEvent).not.toHaveBeenCalled()
    })

    test("changeTitle interpolates, trims and rejects an empty result", async () => {
      const pipeline = await newPipeline()
      const item = await seed(pipeline.id)

      const empty = await run(
        stepFor("changeTitle", pipeline.id, { title: " " }),
      )
      const ok = await run(
        stepFor("changeTitle", pipeline.id, { title: "{{t}}" }),
        { interpolate: async () => "  New title " },
      )

      expect(empty.status).toBe("error")
      expect(ok.status).toBe("success")
      expect((await itemRow(pipeline.id, item.id)).title).toBe("New title")
    })

    test("setCustomField and clearCustomField write and remove a value; bad ids error", async () => {
      const pipeline = await newPipeline()
      const field = await newField(pipeline.id, "plan")
      const item = await seed(pipeline.id)

      const noField = await run(stepFor("setCustomField", pipeline.id))
      const foreignField = await run(
        stepFor("setCustomField", pipeline.id, {
          pipelineFieldId: FOREIGN_ID,
          value: "v",
        }),
      )
      const set = await run(
        stepFor("setCustomField", pipeline.id, {
          pipelineFieldId: field.id,
          value: "{{v}}",
        }),
        { interpolate: async () => "silver" },
      )
      expect([noField.status, foreignField.status, set.status]).toEqual([
        "error",
        "error",
        "success",
      ])
      expect((await itemRow(pipeline.id, item.id)).fieldValues).toEqual({
        [field.id]: "silver",
      })

      const emptyClear = await run(stepFor("clearCustomField", pipeline.id))
      const clear = await run(
        stepFor("clearCustomField", pipeline.id, {
          pipelineFieldIds: [field.id],
        }),
      )
      expect(emptyClear.status).toBe("error")
      expect(clear.status).toBe("success")
      expect((await itemRow(pipeline.id, item.id)).fieldValues).toEqual({})
    })

    test("changeDescription sets and clears the description", async () => {
      const pipeline = await newPipeline()
      const item = await seed(pipeline.id)

      await run(
        stepFor("changeDescription", pipeline.id, { description: "hello" }),
      )
      expect((await itemRow(pipeline.id, item.id)).description).toBe("hello")
      await run(stepFor("changeDescription", pipeline.id, { description: "" }))

      expect((await itemRow(pipeline.id, item.id)).description).toBeNull()
    })

    test("removeFromPipeline deletes the item; a second run skips", async () => {
      const pipeline = await newPipeline()
      await seed(pipeline.id)

      const first = await run(stepFor("removeFromPipeline", pipeline.id))
      const second = await run(stepFor("removeFromPipeline", pipeline.id))

      expect(first.status).toBe("success")
      expect(second.status).toBe("skip")
      expect(await itemsOf(pipeline.id)).toHaveLength(0)
    })

    test("addComment is idempotent per flowExecutionKey and step; without a key it repeats", async () => {
      const pipeline = await newPipeline()
      const item = await seed(pipeline.id)
      const comments = async () =>
        (
          await pipelineItemQueryService.listComments({
            workspaceId: own.workspaceId,
            pipelineId: pipeline.id,
            itemId: item.id,
            scope: token,
          })
        ).items.length
      const step = stepFor("addComment", pipeline.id, { text: "note {{x}}" })
      const interpolate = async (text: string) => text.replace("{{x}}", "1")

      await run(step, { flowExecutionKey: "exec-9", interpolate })
      await run(step, { flowExecutionKey: "exec-9", interpolate })
      expect(await comments()).toBe(1)
      await run(
        stepFor("addComment", pipeline.id, { id: "78", text: "other" }),
        { flowExecutionKey: "exec-9" },
      )
      expect(await comments()).toBe(2)
      await run(step, { interpolate })
      await run(step, { interpolate })
      expect(await comments()).toBe(4)
      expect(
        (await run(stepFor("addComment", pipeline.id, { text: "  " }))).status,
      ).toBe("error")
    })

    test("transfer moves the item even past an empty required field; a foreign pipeline errors", async () => {
      const source = await newPipeline("Src")
      const destination = await newPipeline("Dst")
      const foreign = await pipelineService.create({
        workspaceId: other.workspaceId,
        type: "opportunity",
        name: "Theirs",
        scope: token,
        actor,
      })
      const item = await seed(source.id)

      const toForeign = await run(
        stepFor("transfer", source.id, { destinationPipelineId: foreign.id }),
      )
      expect(toForeign.status).toBe("error")
      expect((await itemRow(source.id, item.id)).pipelineId).toBe(source.id)

      // A required destination field the source has no value for starts
      // empty instead of blocking the move.
      await newField(destination.id, "need", true)
      const ok = await run(
        stepFor("transfer", source.id, {
          destinationPipelineId: destination.id,
        }),
      )

      expect(ok.status).toBe("success")
      const moved = await itemRow(destination.id, item.id)
      expect(moved.pipelineId).toBe(destination.id)
      expect(moved.fieldValues).toEqual({})
    })
  })

  describe("variables read real rows", () => {
    test("latest open item per pipeline else latest; last touched id; scoped to the contact", async () => {
      const first = await newPipeline("Sales")
      const second = await newPipeline("Support")
      const stage = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: first.id,
        scope: token,
        name: "Negotiation",
      })
      await run(stepFor("addToPipeline", first.id, { title: "old" }))
      await run(
        stepFor("addToPipeline", first.id, {
          title: "newest",
          assigneeInboxTeamIds: [own.teamId],
        }),
      )
      await run(stepFor("moveToStage", first.id, { stageId: stage.id }))
      await run(stepFor("changeValue", first.id, { value: "300" }))
      await run(stepFor("addToPipeline", second.id, { title: "lone" }))
      await run(stepFor("changeStatus", second.id, { status: "won" }))
      await run(stepFor("addToPipeline", first.id, { title: "x" }), {
        contactId: own.contactIds[1],
      })

      const targets = await loadPipelineVariableTargets({
        workspaceId: own.workspaceId,
        contactId: own.contactIds[0],
      })

      const sales = targets.find((t) => t.referenceName === "sales")
      expect(sales).toMatchObject({
        name: "newest",
        stageName: "Negotiation",
        status: "open",
        priority: "medium",
        value: 300,
      })
      expect(sales?.assignedAdmins).toEqual(["Support"])
      const support = targets.find((t) => t.referenceName === "support")
      expect(support).toMatchObject({ name: "lone", status: "won" })
      expect(targets.some((t) => t.referenceName === "unknown")).toBe(false)
      const lastId = await loadLastPipelineItemId({
        workspaceId: own.workspaceId,
        contactId: own.contactIds[0],
      })
      expect(lastId).toBe(support?.id)
      expect(
        await loadLastPipelineItemId({
          workspaceId: other.workspaceId,
          contactId: own.contactIds[0],
        }),
      ).toBeNull()
    })
  })
})
