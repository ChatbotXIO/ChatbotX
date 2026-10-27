// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  addComment: vi.fn(),
  transfer: vi.fn(),
  resolveTarget: vi.fn(),
  findPipeline: vi.fn(),
  findCustomField: vi.fn(),
  findFieldValue: vi.fn(),
  liveMemberIds: vi.fn(),
  liveTeamIds: vi.fn(),
  listFields: vi.fn(),
  listStages: vi.fn(),
}))

vi.mock("../src/pipeline/item.service", () => ({
  pipelineItemService: {
    create: mocks.create,
    update: mocks.update,
    delete: mocks.remove,
    transfer: mocks.transfer,
    resolveTargetForContact: mocks.resolveTarget,
  },
}))
vi.mock("../src/pipeline/item-content.service", () => ({
  pipelineItemContentService: { addComment: mocks.addComment },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  pipelineRepository: {
    findById: mocks.findPipeline,
    listFields: mocks.listFields,
  },
  pipelineReferenceRepository: {
    listWorkspaceMembers: mocks.liveMemberIds,
    listInboxTeamIds: mocks.liveTeamIds,
  },
  pipelineStageRepository: { listByPipeline: mocks.listStages },
}))
vi.mock("../src/custom-field/service", () => ({
  customFieldService: { findBy: mocks.findCustomField },
}))
vi.mock("../src/contact-custom-field/value-service", () => ({
  contactCustomFieldValueService: { findValue: mocks.findFieldValue },
}))

const { pipelineActionCanSkip, pipelineStepDefaultFn, pipelineStepActions } =
  await import("@chatbotx.io/flow-config")
const { ChatbotXException, notFoundException } = await import("../src/errors")
const { runPipelineFlowAction, PIPELINE_FLOW_ACTION_HANDLERS } = await import(
  "../src/pipeline/flow-actions"
)

const ctx = (overrides: Record<string, unknown> = {}) => ({
  workspaceId: "ws-1",
  contactId: "c-1",
  flowId: "flow-1",
  flowExecutionKey: "exec-1",
  interpolate: async (text: string) => text.replace("{{name}}", "Ada"),
  ...overrides,
})

const step = <A extends (typeof pipelineStepActions.options)[number]>(
  action: A,
  patch: Record<string, unknown> = {},
) =>
  ({
    ...pipelineStepDefaultFn(action, { id: "s-1", pipelineId: "101" }),
    ...patch,
  }) as ReturnType<typeof pipelineStepDefaultFn>

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findPipeline.mockResolvedValue({ id: "101" })
  mocks.resolveTarget.mockResolvedValue({ id: "item-1" })
  // Every referenced admin, team, field and stage exists unless a test deletes one.
  mocks.liveMemberIds.mockImplementation(async ({ ids }: { ids: string[] }) =>
    ids.map((id) => ({ id, userId: `u-${id}` })),
  )
  mocks.liveTeamIds.mockImplementation(
    async ({ ids }: { ids: string[] }) => ids,
  )
  mocks.listFields.mockResolvedValue([{ id: "301" }, { id: "302" }])
  mocks.listStages.mockResolvedValue([{ id: "201" }])
})

describe("runPipelineFlowAction", () => {
  test("a malformed destinationStageId routes to error before any lookup", async () => {
    const result = await runPipelineFlowAction(
      step("transfer", {
        destinationPipelineId: "102",
        destinationStageId: "not-a-number",
      }),
      ctx(),
    )
    expect(result.status).toBe("error")
    expect(mocks.transfer).not.toHaveBeenCalled()
  })

  test("a malformed or empty due date custom field routes to error before any query", async () => {
    for (const customFieldId of ["abc", "", "9".repeat(25)]) {
      const result = await runPipelineFlowAction(
        step("changeDueDate", {
          dueDate: { mode: "customField", customFieldId },
        }),
        ctx(),
      )
      expect(result.status).toBe("error")
    }
    expect(mocks.findCustomField).not.toHaveBeenCalled()
  })

  test("malformed reference ids route to error without touching the database", async () => {
    expect(
      await runPipelineFlowAction(
        step("moveToStage", { stageId: "20" }),
        ctx(),
      ),
    ).toMatchObject({ status: "success" })
    mocks.findPipeline.mockClear()

    const results = await Promise.all([
      runPipelineFlowAction(step("moveToStage", { pipelineId: "abc" }), ctx()),
      runPipelineFlowAction(step("moveToStage", { stageId: "x1" }), ctx()),
      runPipelineFlowAction(
        step("assign", { assigneeMemberIds: ["bad"] }),
        ctx(),
      ),
      runPipelineFlowAction(
        step("transfer", { destinationPipelineId: "1; drop" }),
        ctx(),
      ),
      runPipelineFlowAction(step("addToPipeline", { stageId: "nope" }), ctx()),
    ])

    for (const result of results) {
      expect(result.status).toBe("error")
    }
    mocks.findPipeline.mockClear()
    await runPipelineFlowAction(
      step("moveToStage", { pipelineId: "abc" }),
      ctx(),
    )
    expect(mocks.findPipeline).not.toHaveBeenCalled()
  })

  test("has a handler for every action", () => {
    expect(Object.keys(PIPELINE_FLOW_ACTION_HANDLERS).sort()).toEqual(
      [...pipelineStepActions.options].sort(),
    )
  })

  test("errors without a pipeline or when it is not in the workspace", async () => {
    expect(
      (
        await runPipelineFlowAction(
          step("changeTitle", { pipelineId: "" }),
          ctx(),
        )
      ).status,
    ).toBe("error")
    // The pipeline is only looked up when the contact has no target item, so a
    // deleted pipeline still routes to error while the happy path costs no read.
    mocks.findPipeline.mockResolvedValue(undefined)
    mocks.resolveTarget.mockResolvedValue(null)
    const result = await runPipelineFlowAction(step("changeTitle"), ctx())
    expect(result.status).toBe("error")
    expect(result.message).toContain("does not exist")
  })

  test("a contact without an item in an existing pipeline skips", async () => {
    mocks.resolveTarget.mockResolvedValue(null)
    const result = await runPipelineFlowAction(step("changeTitle"), ctx())
    expect(result.status).toBe("skip")
  })

  test("a missing pipeline on addToPipeline errors from the service, without a pre-lookup", async () => {
    mocks.create.mockRejectedValueOnce(notFoundException("Pipeline not found"))
    const result = await runPipelineFlowAction(step("addToPipeline"), ctx())
    expect(result).toEqual({ status: "error", message: "Pipeline not found" })
    expect(mocks.findPipeline).not.toHaveBeenCalled()
  })

  test("addToPipeline creates an interpolated item with a dedup key", async () => {
    const result = await runPipelineFlowAction(
      step("addToPipeline", {
        title: "Deal {{name}}",
        description: "  note  ",
        stageId: "201",
        status: "open",
        assigneeMemberIds: ["401"],
        fieldValues: [{ pipelineFieldId: "301", value: "{{name}}" }],
      }),
      ctx(),
    )
    expect(result.status).toBe("success")
    const call = mocks.create.mock.calls[0][0]
    expect(call.idempotencyKey).toBe("exec-1:s-1")
    expect(call.actor).toEqual({
      kind: "flow",
      userId: null,
      sourceId: "flow-1",
    })
    expect(call.fields).toMatchObject({
      title: "Deal Ada",
      description: "note",
      stageId: "201",
      assigneeMemberIds: ["401"],
      dueDate: null,
      fieldValues: { "301": "Ada" },
    })
  })

  test("addToPipeline and addComment send no idempotency key without flowExecutionKey", async () => {
    await runPipelineFlowAction(
      step("addToPipeline", { title: "x" }),
      ctx({ flowExecutionKey: undefined }),
    )
    await runPipelineFlowAction(
      step("addComment", { text: "hi" }),
      ctx({ flowExecutionKey: undefined }),
    )
    expect(mocks.create.mock.calls[0][0].idempotencyKey).toBeUndefined()
    expect(mocks.addComment.mock.calls[0][0].idempotencyKey).toBeUndefined()
  })

  test("other actions never send an idempotency key", async () => {
    await runPipelineFlowAction(step("changeTitle", { title: "x" }), ctx())
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("idempotencyKey")
  })

  test("addToPipeline falls back to a title and rejects a malformed stage", async () => {
    await runPipelineFlowAction(step("addToPipeline", { title: "  " }), ctx())
    expect(mocks.create.mock.calls[0][0].fields.title).toBe("Untitled")
    const result = await runPipelineFlowAction(
      step("addToPipeline", { stageId: "bad" }),
      ctx(),
    )
    expect(result.status).toBe("error")
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  test("a service conflict routes to error with its message", async () => {
    mocks.create.mockRejectedValue(
      new ChatbotXException("limit reached", "conflict", 409),
    )
    const result = await runPipelineFlowAction(
      step("addToPipeline", { title: "x" }),
      ctx(),
    )
    expect(result).toEqual({ status: "error", message: "limit reached" })
  })

  test("an unexpected failure propagates so the job can retry", async () => {
    mocks.create.mockRejectedValue(new Error("db down"))
    await expect(
      runPipelineFlowAction(step("addToPipeline", { title: "x" }), ctx()),
    ).rejects.toThrow("db down")
  })

  const SKIPPING_ACTIONS = [
    ["moveToStage", { stageId: "201" }],
    ["changeValue", { value: "10" }],
    ["assign", { assigneeMemberIds: ["401"] }],
    ["changeStatus", { status: "won" }],
    ["changePriority", { priority: "high" }],
    ["changeDueDate", { dueDate: { mode: "none" } }],
    ["changeTitle", { title: "T" }],
    ["setCustomField", { pipelineFieldId: "301", value: "v" }],
    ["clearCustomField", { pipelineFieldIds: ["301"] }],
    ["changeDescription", { description: "d" }],
    ["removeFromPipeline", {}],
    ["addComment", { text: "c" }],
    ["transfer", { destinationPipelineId: "102" }],
  ] as const

  // The builder hides the skip handle of actions that cannot skip; this keeps
  // that rule (flow-config) and the handlers here in step.
  test("the actions that can skip are exactly the ones the builder shows a skip handle for", () => {
    expect(SKIPPING_ACTIONS.map(([action]) => action).sort()).toEqual(
      pipelineStepActions.options.filter(pipelineActionCanSkip).sort(),
    )
  })

  test("addToPipeline never skips: with no open item it creates one", async () => {
    mocks.create.mockResolvedValue({ id: "item-9" })
    mocks.resolveTarget.mockResolvedValue(null)
    mocks.findPipeline.mockResolvedValue({ id: "101" })
    const result = await runPipelineFlowAction(
      step("addToPipeline", { title: "x" }),
      ctx(),
    )
    expect(result.status).toBe("success")
    expect(mocks.create).toHaveBeenCalled()
  })

  test.each(
    SKIPPING_ACTIONS,
  )("%s skips when the contact has no open item", async (action, patch) => {
    mocks.resolveTarget.mockResolvedValue(null)
    mocks.findPipeline.mockResolvedValue({ id: "101" })
    const result = await runPipelineFlowAction(step(action, patch), ctx())
    expect(result.status).toBe("skip")
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.transfer).not.toHaveBeenCalled()
    expect(mocks.addComment).not.toHaveBeenCalled()
  })

  test("targets the latest open item of the contact in the pipeline", async () => {
    await runPipelineFlowAction(
      step("changePriority", { priority: "high" }),
      ctx(),
    )
    expect(mocks.resolveTarget).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      pipelineId: "101",
      contactId: "c-1",
    })
    expect(mocks.update.mock.calls[0][0]).toMatchObject({
      itemId: "item-1",
      fields: { priority: "high" },
    })
  })

  test("moveToStage requires a well-formed stage id", async () => {
    expect(
      (
        await runPipelineFlowAction(
          step("moveToStage", { stageId: "201" }),
          ctx(),
        )
      ).status,
    ).toBe("success")
    expect(mocks.update.mock.calls[0][0].fields).toEqual({ stageId: "201" })
    expect(
      (
        await runPipelineFlowAction(
          step("moveToStage", { stageId: "x" }),
          ctx(),
        )
      ).status,
    ).toBe("error")
    expect(
      (await runPipelineFlowAction(step("moveToStage", { stageId: "" }), ctx()))
        .status,
    ).toBe("error")
  })

  test("changeValue accepts a finite number >= 0 and rejects the rest", async () => {
    const run = (value: string) =>
      runPipelineFlowAction(step("changeValue", { value }), ctx())
    expect((await run("12.5")).status).toBe("success")
    expect(mocks.update.mock.calls[0][0].fields).toEqual({ value: 12.5 })
    expect((await run("0")).status).toBe("success")
    for (const bad of ["", "abc", "-1", "Infinity", "1e30"]) {
      expect((await run(bad)).status).toBe("error")
    }
    expect(mocks.update).toHaveBeenCalledTimes(2)
  })

  test("changeValue interpolates variables first", async () => {
    const result = await runPipelineFlowAction(
      step("changeValue", { value: "{{name}}" }),
      ctx({ interpolate: async () => "42" }),
    )
    expect(result.status).toBe("success")
    expect(mocks.update.mock.calls[0][0].fields).toEqual({ value: 42 })
  })

  test("setCustomField / clearCustomField write and null the field values", async () => {
    await runPipelineFlowAction(
      step("setCustomField", { pipelineFieldId: "301", value: "{{name}}" }),
      ctx(),
    )
    expect(mocks.update.mock.calls[0][0].fields).toEqual({
      fieldValues: { "301": "Ada" },
    })
    await runPipelineFlowAction(
      step("clearCustomField", { pipelineFieldIds: ["301", "302"] }),
      ctx(),
    )
    expect(mocks.update.mock.calls[1][0].fields).toEqual({
      fieldValues: { "301": null, "302": null },
    })
    expect(
      (
        await runPipelineFlowAction(
          step("clearCustomField", { pipelineFieldIds: [] }),
          ctx(),
        )
      ).status,
    ).toBe("error")
    expect(
      (
        await runPipelineFlowAction(
          step("setCustomField", { pipelineFieldId: "" }),
          ctx(),
        )
      ).status,
    ).toBe("error")
  })

  test("changeTitle rejects an empty interpolated title; changeDescription clears with null", async () => {
    expect(
      (await runPipelineFlowAction(step("changeTitle", { title: " " }), ctx()))
        .status,
    ).toBe("error")
    await runPipelineFlowAction(
      step("changeDescription", { description: " " }),
      ctx(),
    )
    expect(mocks.update.mock.calls[0][0].fields).toEqual({ description: null })
  })

  test("assign replaces members and teams", async () => {
    await runPipelineFlowAction(
      step("assign", {
        assigneeMemberIds: ["401"],
        assigneeInboxTeamIds: ["501"],
      }),
      ctx(),
    )
    expect(mocks.update.mock.calls[0][0].fields).toEqual({
      assigneeMemberIds: ["401"],
      assigneeInboxTeamIds: ["501"],
    })
  })

  test("assign with no assignees errors instead of clearing them", async () => {
    const result = await runPipelineFlowAction(
      step("assign", { assigneeMemberIds: [], assigneeInboxTeamIds: [] }),
      ctx(),
    )
    expect(result).toEqual({
      status: "error",
      message: "The assign step has no assignees",
    })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("assign with only teams is accepted", async () => {
    const result = await runPipelineFlowAction(
      step("assign", { assigneeMemberIds: [], assigneeInboxTeamIds: ["501"] }),
      ctx(),
    )
    expect(result.status).toBe("success")
  })

  test("addToPipeline with empty assignee lists succeeds and leaves them empty", async () => {
    mocks.create.mockResolvedValue({ id: "item-1" })
    const result = await runPipelineFlowAction(
      step("addToPipeline", {
        title: "x",
        assigneeMemberIds: [],
        assigneeInboxTeamIds: [],
      }),
      ctx(),
    )
    expect(result.status).toBe("success")
    expect(mocks.create.mock.calls[0][0].fields).toMatchObject({
      assigneeMemberIds: [],
      assigneeInboxTeamIds: [],
    })
  })

  describe("due date", () => {
    test("none clears, fixed sets an instant", async () => {
      await runPipelineFlowAction(
        step("changeDueDate", { dueDate: { mode: "none" } }),
        ctx(),
      )
      expect(mocks.update.mock.calls[0][0].fields).toEqual({ dueDate: null })
      await runPipelineFlowAction(
        step("changeDueDate", {
          dueDate: { mode: "fixed", at: "2026-01-02T03:04:05.000Z" },
        }),
        ctx(),
      )
      expect(mocks.update.mock.calls[1][0].fields.dueDate).toEqual(
        new Date("2026-01-02T03:04:05.000Z"),
      )
    })

    test("customField mode reads the contact's date value; blank clears", async () => {
      mocks.findCustomField.mockResolvedValue({ id: "601", type: "datetime" })
      mocks.findFieldValue.mockResolvedValue("2026-03-04T05:06:07.000Z")
      const dueDate = { mode: "customField", customFieldId: "601" }
      await runPipelineFlowAction(step("changeDueDate", { dueDate }), ctx())
      expect(mocks.update.mock.calls[0][0].fields.dueDate).toEqual(
        new Date("2026-03-04T05:06:07.000Z"),
      )
      mocks.findFieldValue.mockResolvedValue("  ")
      await runPipelineFlowAction(step("changeDueDate", { dueDate }), ctx())
      expect(mocks.update.mock.calls[1][0].fields.dueDate).toBeNull()
      mocks.findFieldValue.mockResolvedValue(null)
      await runPipelineFlowAction(step("changeDueDate", { dueDate }), ctx())
      expect(mocks.update.mock.calls[2][0].fields.dueDate).toBeNull()
    })

    test("customField mode rejects non-date fields and unparsable values", async () => {
      const dueDate = { mode: "customField", customFieldId: "601" }
      mocks.findCustomField.mockResolvedValue({ id: "601", type: "shortText" })
      expect(
        (await runPipelineFlowAction(step("changeDueDate", { dueDate }), ctx()))
          .status,
      ).toBe("error")
      mocks.findCustomField.mockResolvedValue(undefined)
      expect(
        (await runPipelineFlowAction(step("changeDueDate", { dueDate }), ctx()))
          .status,
      ).toBe("error")
      mocks.findCustomField.mockResolvedValue({ id: "601", type: "date" })
      mocks.findFieldValue.mockResolvedValue("not a date")
      expect(
        (await runPipelineFlowAction(step("changeDueDate", { dueDate }), ctx()))
          .status,
      ).toBe("error")
      expect(mocks.update).not.toHaveBeenCalled()
    })
  })

  test("removeFromPipeline deletes the target item", async () => {
    expect(
      (await runPipelineFlowAction(step("removeFromPipeline"), ctx())).status,
    ).toBe("success")
    expect(mocks.remove.mock.calls[0][0]).toMatchObject({
      itemId: "item-1",
      pipelineId: "101",
    })
  })

  test("addComment trims, rejects empty and over-long text", async () => {
    expect(
      (
        await runPipelineFlowAction(
          step("addComment", { text: "  {{name}}  " }),
          ctx(),
        )
      ).status,
    ).toBe("success")
    expect(mocks.addComment.mock.calls[0][0]).toMatchObject({
      text: "Ada",
      idempotencyKey: "exec-1:s-1",
    })
    expect(
      (await runPipelineFlowAction(step("addComment", { text: " " }), ctx()))
        .status,
    ).toBe("error")
    expect(
      (
        await runPipelineFlowAction(
          step("addComment", { text: "x".repeat(2001) }),
          ctx(),
        )
      ).status,
    ).toBe("error")
    expect(mocks.addComment).toHaveBeenCalledTimes(1)
  })

  test("transfer validates the destination pipeline and stage", async () => {
    const ok = await runPipelineFlowAction(
      step("transfer", {
        destinationPipelineId: "102",
        destinationStageId: "201",
      }),
      ctx(),
    )
    expect(ok.status).toBe("success")
    expect(mocks.transfer.mock.calls[0][0]).toMatchObject({
      pipelineId: "101",
      destinationPipelineId: "102",
      destinationStageId: "201",
    })
    mocks.transfer.mockRejectedValueOnce(
      notFoundException("Pipeline not found"),
    )
    const missing = await runPipelineFlowAction(
      step("transfer", { destinationPipelineId: "109" }),
      ctx(),
    )
    expect(missing).toEqual({ status: "error", message: "Pipeline not found" })
    expect(mocks.findPipeline).not.toHaveBeenCalled()
    expect(
      (
        await runPipelineFlowAction(
          step("transfer", { destinationPipelineId: "" }),
          ctx(),
        )
      ).status,
    ).toBe("error")
    expect(
      (
        await runPipelineFlowAction(
          step("transfer", {
            destinationPipelineId: "102",
            destinationStageId: "bad",
          }),
          ctx(),
        )
      ).status,
    ).toBe("error")
    expect(mocks.transfer).toHaveBeenCalledTimes(2)
  })

  describe("references deleted after the flow was built", () => {
    test("addToPipeline still creates the item, without the deleted stage, admins, teams and fields", async () => {
      mocks.liveMemberIds.mockResolvedValue([{ id: "401", userId: "u" }])
      mocks.liveTeamIds.mockResolvedValue([])
      mocks.listFields.mockResolvedValue([{ id: "301" }])
      mocks.listStages.mockResolvedValue([{ id: "999" }])

      const result = await runPipelineFlowAction(
        step("addToPipeline", {
          title: "Deal",
          stageId: "201",
          assigneeMemberIds: ["401", "402"],
          assigneeInboxTeamIds: ["501"],
          fieldValues: [
            { pipelineFieldId: "301", value: "kept" },
            { pipelineFieldId: "302", value: "gone" },
          ],
        }),
        ctx(),
      )

      expect(result.status).toBe("success")
      expect(mocks.create.mock.calls[0][0].fields).toMatchObject({
        stageId: undefined,
        assigneeMemberIds: ["401"],
        assigneeInboxTeamIds: [],
        fieldValues: { "301": "kept" },
      })
    })

    test("addToPipeline adds the item without a due date when the due date field was deleted", async () => {
      mocks.findCustomField.mockResolvedValue(null)

      const result = await runPipelineFlowAction(
        step("addToPipeline", {
          title: "Deal",
          dueDate: { mode: "customField", customFieldId: "601" },
        }),
        ctx(),
      )

      expect(result.status).toBe("success")
      expect(mocks.create.mock.calls[0][0].fields.dueDate).toBeNull()
    })

    test("changeDueDate errors instead of clearing the date when its field was deleted", async () => {
      mocks.findCustomField.mockResolvedValue(null)

      const result = await runPipelineFlowAction(
        step("changeDueDate", {
          dueDate: { mode: "customField", customFieldId: "601" },
        }),
        ctx(),
      )

      expect(result.status).toBe("error")
      expect(mocks.update).not.toHaveBeenCalled()
    })

    test("assign keeps the remaining assignees and errors only when none is left", async () => {
      mocks.liveMemberIds.mockResolvedValue([{ id: "401", userId: "u" }])

      const kept = await runPipelineFlowAction(
        step("assign", { assigneeMemberIds: ["401", "402"] }),
        ctx(),
      )
      expect(kept.status).toBe("success")
      expect(mocks.update.mock.calls[0][0].fields).toMatchObject({
        assigneeMemberIds: ["401"],
      })

      mocks.liveMemberIds.mockResolvedValue([])
      const none = await runPipelineFlowAction(
        step("assign", { assigneeMemberIds: ["402"] }),
        ctx(),
      )
      expect(none.status).toBe("error")
    })

    test("clearCustomField skips deleted fields and is a no-op when all are gone", async () => {
      mocks.listFields.mockResolvedValue([{ id: "301" }])
      await runPipelineFlowAction(
        step("clearCustomField", { pipelineFieldIds: ["301", "302"] }),
        ctx(),
      )
      expect(mocks.update.mock.calls[0][0].fields).toEqual({
        fieldValues: { "301": null },
      })

      mocks.update.mockClear()
      mocks.listFields.mockResolvedValue([])
      const result = await runPipelineFlowAction(
        step("clearCustomField", { pipelineFieldIds: ["302"] }),
        ctx(),
      )
      expect(result.status).toBe("success")
      expect(mocks.update).not.toHaveBeenCalled()
    })
  })
})
