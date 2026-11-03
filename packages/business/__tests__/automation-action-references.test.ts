import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listFlowIds: vi.fn(),
  listNodes: vi.fn(),
  findCustomFieldKeys: vi.fn(),
  listStagesByPipelines: vi.fn(),
  listFieldsByPipelines: vi.fn(),
  findTags: vi.fn(),
  findSequences: vi.fn(),
  findBotFields: vi.fn(),
  findCustomFields: vi.fn(),
  findPipeline: vi.fn(),
  listFields: vi.fn(),
  listStages: vi.fn(),
  listMembers: vi.fn(),
  listTeams: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  flowRepository: {
    listIdsByIds: mocks.listFlowIds,
    listCurrentVersionNodesByFlowIds: mocks.listNodes,
  },
  pipelineRepository: {
    findById: mocks.findPipeline,
    listFieldsByPipelineIds: mocks.listFieldsByPipelines,
  },
  pipelineStageRepository: { listByPipelineIds: mocks.listStagesByPipelines },
  pipelineReferenceRepository: {
    listWorkspaceMembers: mocks.listMembers,
    listInboxTeamIds: mocks.listTeams,
  },
}))
vi.mock("../src/tag/service", () => ({
  tagService: { findManyByIds: mocks.findTags },
}))
vi.mock("../src/sequence/service", () => ({
  sequenceService: { listLabelsByIds: mocks.findSequences },
}))
vi.mock("../src/bot-field/service", () => ({
  botFieldService: { findManyByIds: mocks.findBotFields },
}))
vi.mock("../src/custom-field/service", () => ({
  customFieldService: {
    findManyByIds: mocks.findCustomFields,
    findManyByKeys: mocks.findCustomFieldKeys,
  },
}))

const { findInvalidActionReferences, indexesOfNewActions } = await import(
  "../src/automation-action/references"
)

const check = (
  actions: Record<string, unknown>[],
  indexes?: ReadonlySet<number>,
) => findInvalidActionReferences({ workspaceId: "ws-1", actions, indexes })

/** Every id exists except 999, the id the negative cases use. */
const MISSING_ID = "999"
const existingIds = ({ ids }: { ids: string[] }) =>
  ids.filter((id) => id !== MISSING_ID)
const echoIds = (input: { ids: string[] }) =>
  Promise.resolve(existingIds(input).map((id) => ({ id })))

beforeEach(() => {
  vi.clearAllMocks()
  // Flow 10 is published with nodes 20 and 21; flow 11 was never published.
  mocks.listNodes.mockResolvedValue([
    { flowId: "10", flowName: "A", nodes: [{ id: "20" }, { id: "21" }] },
    { flowId: "11", flowName: "B", nodes: [] },
  ])
  mocks.listFlowIds.mockImplementation(async ({ ids }: { ids: string[] }) =>
    ["10", "11"].filter((id) => ids.includes(id)),
  )
  // A custom field is found by id or by the name "Plan".
  mocks.findCustomFieldKeys.mockImplementation(
    async ({ keys }: { keys: string[] }) =>
      new Map(
        keys
          .filter((key) => key === "Plan" || key !== "999")
          .map((key) => [key, { id: key }]),
      ),
  )
  mocks.findTags.mockImplementation(echoIds)
  mocks.findSequences.mockImplementation(echoIds)
  mocks.findBotFields.mockImplementation(echoIds)
  mocks.findCustomFields.mockImplementation(echoIds)
  mocks.findPipeline.mockImplementation(({ id }: { id: string }) =>
    Promise.resolve(["101", "102"].includes(id) ? { id } : undefined),
  )
  mocks.listFieldsByPipelines.mockResolvedValue([
    { id: "301", pipelineId: "101" },
  ])
  mocks.listStagesByPipelines.mockResolvedValue([
    { id: "201", pipelineId: "101" },
    { id: "202", pipelineId: "102" },
  ])
  mocks.listMembers.mockImplementation(echoIds)
  mocks.listTeams.mockImplementation((input: { ids: string[] }) =>
    Promise.resolve(existingIds(input)),
  )
})

describe("findInvalidActionReferences", () => {
  test("a workspace with every referenced record has no problems", async () => {
    expect(
      await check([
        { type: "startAnotherFlow", flowId: "10" },
        { type: "startExternalStep", flowId: "10", nodeId: "20" },
        { type: "addTag", tagIds: ["1", "2"] },
        { type: "removeTag", tagIds: ["3"] },
        { type: "addSequence", sequenceIds: ["7", "8"] },
        { type: "removeSequence", sequenceIds: ["9"] },
        { type: "setCustomField", customFieldId: "5" },
        { type: "clearCustomField", customFieldId: "bot_field:6" },
        { type: "transferConversationToHuman" },
      ]),
    ).toEqual([])
  })

  test("unknown action types and optional empty slots reference nothing", async () => {
    expect(
      await check([
        { type: "somethingNew" },
        { type: "pipeline", pipelineId: "101", action: "changeTitle" },
        {
          type: "pipeline",
          pipelineId: "101",
          action: "addToPipeline",
          stageId: "",
          assigneeMemberIds: [],
          assigneeInboxTeamIds: [],
          dueDate: { mode: "customField", customFieldId: "" },
          fieldValues: [],
        },
        {
          type: "pipeline",
          pipelineId: "101",
          action: "setCustomField",
          pipelineFieldId: "",
        },
      ]),
    ).toEqual([])
  })

  describe("a custom field named by setCustomField", () => {
    test("is accepted for a trigger, which resolves names", async () => {
      expect(
        await findInvalidActionReferences({
          workspaceId: "ws-1",
          fieldNames: true,
          actions: [{ type: "setCustomField", customFieldId: "Plan" }],
        }),
      ).toEqual([])
      expect(mocks.findCustomFieldKeys).toHaveBeenCalledWith(
        expect.objectContaining({ keys: ["Plan"] }),
      )
    })

    test("is reported when the name matches nothing", async () => {
      expect(
        await findInvalidActionReferences({
          workspaceId: "ws-1",
          fieldNames: true,
          actions: [{ type: "setCustomField", customFieldId: "999" }],
        }),
      ).toEqual([{ index: 0, field: "customFieldId" }])
    })

    test("clearCustomField still needs an id", async () => {
      expect(
        await findInvalidActionReferences({
          workspaceId: "ws-1",
          fieldNames: true,
          actions: [{ type: "clearCustomField", customFieldId: "Plan" }],
        }),
      ).toEqual([{ index: 0, field: "customFieldId" }])
    })
  })

  test("every lookup runs on the caller's transaction", async () => {
    const tx = { __tx: true } as never

    await findInvalidActionReferences({
      workspaceId: "ws-1",
      tx,
      actions: [
        { type: "addTag", tagIds: ["1"] },
        { type: "addSequence", sequenceIds: ["7"] },
        { type: "startExternalStep", flowId: "10", nodeId: "20" },
        { type: "startAnotherFlow", flowId: "10" },
        { type: "setCustomField", customFieldId: "5" },
        { type: "clearCustomField", customFieldId: "bot_field:6" },
        {
          type: "pipeline",
          pipelineId: "101",
          action: "assign",
          assigneeMemberIds: ["401"],
          assigneeInboxTeamIds: ["501"],
        },
      ],
    })

    expect(mocks.findTags).toHaveBeenCalledWith(expect.objectContaining({ tx }))
    expect(mocks.findSequences).toHaveBeenCalledWith(
      expect.objectContaining({ tx }),
    )
    expect(mocks.findCustomFields).toHaveBeenCalledWith(
      expect.objectContaining({ tx }),
    )
    expect(mocks.findBotFields).toHaveBeenCalledWith(
      expect.objectContaining({ tx }),
    )
    expect(mocks.listFlowIds.mock.calls[0]?.[1]).toBe(tx)
    expect(mocks.listNodes.mock.calls[0]?.[1]).toBe(tx)
    expect(mocks.findPipeline.mock.calls[0]?.[1]).toBe(tx)
    expect(mocks.listMembers.mock.calls[0]?.[1]).toBe(tx)
    expect(mocks.listTeams.mock.calls[0]?.[1]).toBe(tx)
  })

  test("a flow is checked by id without loading node documents", async () => {
    await check([{ type: "startAnotherFlow", flowId: "10" }])

    expect(mocks.listFlowIds).toHaveBeenCalledTimes(1)
    expect(mocks.listNodes).not.toHaveBeenCalled()
  })

  test("pipelines are checked with one stage and one field query, not one per pipeline", async () => {
    await check([
      {
        type: "pipeline",
        pipelineId: "101",
        action: "moveToStage",
        stageId: "201",
      },
      {
        type: "pipeline",
        pipelineId: "102",
        action: "moveToStage",
        stageId: "202",
      },
      {
        type: "pipeline",
        pipelineId: "101",
        action: "setCustomField",
        pipelineFieldId: "301",
        value: "x",
      },
    ])

    expect(mocks.listStagesByPipelines).toHaveBeenCalledTimes(1)
    expect(mocks.listFieldsByPipelines).toHaveBeenCalledTimes(1)
  })

  test.each([
    ["a missing flow", { type: "startAnotherFlow", flowId: "99" }, "flowId"],
    [
      "a node that is not in the flow's published version",
      { type: "startExternalStep", flowId: "10", nodeId: "99" },
      "nodeId",
    ],
    [
      "a node of an unpublished flow",
      { type: "startExternalStep", flowId: "11", nodeId: "20" },
      "nodeId",
    ],
    ["a malformed id", { type: "addTag", tagIds: ["1", "x"] }, "tagIds.1"],
    [
      "a sequence that does not exist",
      { type: "addSequence", sequenceIds: ["7", MISSING_ID] },
      "sequenceIds.1",
    ],
    [
      "a malformed sequence id",
      { type: "removeSequence", sequenceIds: ["x"] },
      "sequenceIds.0",
    ],
    [
      "an empty sequence id",
      { type: "addSequence", sequenceIds: [""] },
      "sequenceIds.0",
    ],
    [
      "a custom field referenced by name where only ids are accepted",
      { type: "setCustomField", customFieldId: "Plan" },
      "customFieldId",
    ],
    ["an empty tag id", { type: "addTag", tagIds: [""] }, "tagIds.0"],
    ["an empty flow id", { type: "startAnotherFlow", flowId: "" }, "flowId"],
    [
      "an empty node id",
      { type: "startExternalStep", flowId: "10", nodeId: "" },
      "nodeId",
    ],
  ])("%s is reported at its property", async (_label, action, field) => {
    expect(await check([action])).toEqual([{ index: 0, field }])
  })

  test("a node of a missing flow is reported along with its flow", async () => {
    expect(
      await check([{ type: "startExternalStep", flowId: "99", nodeId: "20" }]),
    ).toEqual([
      { index: 0, field: "flowId" },
      { index: 0, field: "nodeId" },
    ])
  })

  test("a missing tag, custom field or bot field is reported", async () => {
    mocks.findTags.mockResolvedValue([])
    mocks.findCustomFields.mockResolvedValue([])
    mocks.findBotFields.mockResolvedValue([])

    expect(
      await check([
        { type: "addTag", tagIds: ["1"] },
        { type: "setCustomField", customFieldId: "5" },
        { type: "clearCustomField", customFieldId: "bot_field:6" },
      ]),
    ).toEqual([
      { index: 0, field: "tagIds.0" },
      { index: 1, field: "customFieldId" },
      { index: 2, field: "customFieldId" },
    ])
  })

  test("an id too large for a bigint is reported without querying it", async () => {
    expect(
      await check([
        { type: "addTag", tagIds: ["12345678901234567890"] },
        { type: "startAnotherFlow", flowId: "9".repeat(25) },
      ]),
    ).toEqual([
      { index: 0, field: "tagIds.0" },
      { index: 1, field: "flowId" },
    ])
    expect(mocks.findTags).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: [],
      tx: undefined,
    })
  })

  test("malformed ids are rejected without querying them", async () => {
    await check([{ type: "addTag", tagIds: ["x"] }])

    expect(mocks.findTags).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: [],
    })
  })

  test("every kind is looked up once however many actions use it", async () => {
    await check([
      { type: "addTag", tagIds: ["1", "2"] },
      { type: "removeTag", tagIds: ["2", "3"] },
      { type: "startAnotherFlow", flowId: "10" },
      { type: "startExternalStep", flowId: "10", nodeId: "20" },
    ])

    expect(mocks.findTags).toHaveBeenCalledTimes(1)
    expect(mocks.findTags.mock.calls[0]?.[0].ids).toEqual(["1", "2", "3"])
    expect(mocks.listFlowIds).toHaveBeenCalledTimes(1)
    expect(mocks.listNodes).toHaveBeenCalledTimes(1)
    expect(mocks.listNodes.mock.calls[0]?.[0]).toEqual({
      workspaceId: "ws-1",
      flowIds: ["10"],
    })
  })

  describe("pipeline actions", () => {
    const pipelineAction = (patch: Record<string, unknown>) => ({
      type: "pipeline",
      pipelineId: "101",
      ...patch,
    })

    test.each([
      [
        "a missing pipeline",
        pipelineAction({ pipelineId: "999", action: "changeTitle" }),
        "pipelineId",
      ],
      [
        "a stage that is not in the pipeline",
        pipelineAction({ action: "moveToStage", stageId: "999" }),
        "stageId",
      ],
      [
        "a stage on addToPipeline",
        pipelineAction({
          action: "addToPipeline",
          stageId: "999",
          assigneeMemberIds: [],
          assigneeInboxTeamIds: [],
          dueDate: { mode: "none" },
          fieldValues: [],
        }),
        "stageId",
      ],
      [
        "an admin that no longer exists",
        pipelineAction({
          action: "assign",
          assigneeMemberIds: ["401", "999"],
          assigneeInboxTeamIds: [],
        }),
        "assigneeMemberIds.1",
      ],
      [
        "an inbox team that no longer exists",
        pipelineAction({
          action: "assign",
          assigneeMemberIds: [],
          assigneeInboxTeamIds: ["999"],
        }),
        "assigneeInboxTeamIds.0",
      ],
      [
        "a due-date custom field that does not exist",
        pipelineAction({
          action: "changeDueDate",
          dueDate: { mode: "customField", customFieldId: "999" },
        }),
        "dueDate.customFieldId",
      ],
      [
        "a pipeline field of another pipeline",
        pipelineAction({
          action: "setCustomField",
          pipelineFieldId: "999",
          value: "x",
        }),
        "pipelineFieldId",
      ],
      [
        "a field value of addToPipeline",
        pipelineAction({
          action: "addToPipeline",
          assigneeMemberIds: [],
          assigneeInboxTeamIds: [],
          dueDate: { mode: "none" },
          fieldValues: [
            { pipelineFieldId: "301", value: "ok" },
            { pipelineFieldId: "999", value: "bad" },
          ],
        }),
        "fieldValues.1.pipelineFieldId",
      ],
      [
        "a field to clear",
        pipelineAction({
          action: "clearCustomField",
          pipelineFieldIds: ["301", "999"],
        }),
        "pipelineFieldIds.1",
      ],
      [
        "a destination pipeline",
        pipelineAction({ action: "transfer", destinationPipelineId: "999" }),
        "destinationPipelineId",
      ],
    ])("%s is reported", async (_label, action, field) => {
      const problems = await check([action])

      expect(problems).toEqual([{ index: 0, field }])
    })

    test("a destination stage is checked against the destination pipeline", async () => {
      expect(
        await check([
          pipelineAction({
            action: "transfer",
            destinationPipelineId: "102",
            destinationStageId: "202",
          }),
        ]),
      ).toEqual([])
      expect(
        await check([
          pipelineAction({
            action: "transfer",
            destinationPipelineId: "102",
            destinationStageId: "201",
          }),
        ]),
      ).toEqual([{ index: 0, field: "destinationStageId" }])
    })

    test("a valid action of every reference-bearing kind passes", async () => {
      expect(
        await check([
          pipelineAction({ action: "moveToStage", stageId: "201" }),
          pipelineAction({
            action: "assign",
            assigneeMemberIds: ["401"],
            assigneeInboxTeamIds: ["501"],
          }),
          pipelineAction({
            action: "changeDueDate",
            dueDate: { mode: "customField", customFieldId: "7" },
          }),
          pipelineAction({
            action: "clearCustomField",
            pipelineFieldIds: ["301"],
          }),
        ]),
      ).toEqual([])
    })
  })

  describe("workspace scoping", () => {
    // Records only exist in ws-1: a lookup for any other workspace finds none.
    const onlyInWorkspaceOne =
      <Input extends { workspaceId: string }>(
        rows: (input: Input) => unknown,
      ) =>
      (input: Input) =>
        Promise.resolve(input.workspaceId === "ws-1" ? rows(input) : [])

    const everyKindOfReference = [
      { type: "startAnotherFlow", flowId: "10" },
      { type: "startExternalStep", flowId: "10", nodeId: "20" },
      { type: "addTag", tagIds: ["1"] },
      { type: "setCustomField", customFieldId: "5" },
      { type: "clearCustomField", customFieldId: "bot_field:6" },
      {
        type: "pipeline",
        pipelineId: "101",
        action: "addToPipeline",
        stageId: "201",
        assigneeMemberIds: ["401"],
        assigneeInboxTeamIds: ["501"],
        dueDate: { mode: "customField", customFieldId: "7" },
        fieldValues: [{ pipelineFieldId: "301", value: "x" }],
      },
    ]

    test("every lookup carries the caller's workspace id", async () => {
      await check(everyKindOfReference)

      for (const mock of [
        mocks.listFlowIds,
        mocks.listNodes,
        mocks.findTags,
        mocks.findCustomFields,
        mocks.findCustomFieldKeys,
        mocks.findBotFields,
        mocks.findPipeline,
        mocks.listStagesByPipelines,
        mocks.listFieldsByPipelines,
        mocks.listMembers,
        mocks.listTeams,
      ]) {
        expect(mock).toHaveBeenCalled()
        for (const [input] of mock.mock.calls) {
          expect(input).toMatchObject({ workspaceId: "ws-1" })
        }
      }
    })

    test("records that exist only in another workspace are reported at their paths", async () => {
      mocks.listFlowIds.mockImplementation(
        onlyInWorkspaceOne(({ ids }: { ids: string[] }) => ids),
      )
      mocks.listNodes.mockImplementation(
        onlyInWorkspaceOne(() => [
          { flowId: "10", flowName: "A", nodes: [{ id: "20" }] },
        ]),
      )
      for (const mock of [
        mocks.findTags,
        mocks.findCustomFields,
        mocks.findBotFields,
        mocks.listMembers,
      ]) {
        mock.mockImplementation(
          onlyInWorkspaceOne(({ ids }: { ids: string[] }) =>
            ids.map((id) => ({ id })),
          ),
        )
      }
      mocks.listTeams.mockImplementation(
        onlyInWorkspaceOne(({ ids }: { ids: string[] }) => ids),
      )
      mocks.findPipeline.mockImplementation(
        ({ workspaceId, id }: { workspaceId: string; id: string }) =>
          Promise.resolve(workspaceId === "ws-1" ? { id } : undefined),
      )
      mocks.listStagesByPipelines.mockImplementation(
        onlyInWorkspaceOne(() => [{ id: "201", pipelineId: "101" }]),
      )
      mocks.listFieldsByPipelines.mockImplementation(
        onlyInWorkspaceOne(() => [{ id: "301", pipelineId: "101" }]),
      )

      expect(
        await findInvalidActionReferences({
          workspaceId: "ws-1",
          actions: everyKindOfReference,
        }),
      ).toEqual([])
      expect(
        await findInvalidActionReferences({
          workspaceId: "ws-2",
          actions: everyKindOfReference,
        }),
      ).toEqual([
        { index: 0, field: "flowId" },
        { index: 1, field: "flowId" },
        { index: 1, field: "nodeId" },
        { index: 2, field: "tagIds.0" },
        { index: 3, field: "customFieldId" },
        { index: 4, field: "customFieldId" },
        { index: 5, field: "pipelineId" },
        { index: 5, field: "stageId" },
        { index: 5, field: "assigneeMemberIds.0" },
        { index: 5, field: "assigneeInboxTeamIds.0" },
        { index: 5, field: "dueDate.customFieldId" },
        { index: 5, field: "fieldValues.0.pipelineFieldId" },
      ])
    })

    test("a stage or field of a different pipeline than the action's is reported", async () => {
      const problems = await check([
        {
          type: "pipeline",
          pipelineId: "101",
          action: "moveToStage",
          stageId: "202",
        },
        {
          type: "pipeline",
          pipelineId: "102",
          action: "setCustomField",
          pipelineFieldId: "301",
          value: "x",
        },
        {
          type: "pipeline",
          pipelineId: "102",
          action: "clearCustomField",
          pipelineFieldIds: ["301"],
        },
      ])

      expect(problems).toEqual([
        { index: 0, field: "stageId" },
        { index: 1, field: "pipelineFieldId" },
        { index: 2, field: "pipelineFieldIds.0" },
      ])
    })
  })

  describe("grandfathered actions on update", () => {
    const dangling = { type: "startAnotherFlow", flowId: "99" }
    const fresh = { type: "startAnotherFlow", flowId: "98" }

    const checkUpdate = (next: Record<string, unknown>[]) =>
      check(next, indexesOfNewActions(next, [dangling]))

    test("an unchanged dangling action is not re-validated", async () => {
      expect(await checkUpdate([dangling])).toEqual([])
      expect(mocks.listFlowIds).not.toHaveBeenCalled()
    })

    test("inserting in front or reordering keeps it grandfathered", async () => {
      expect(await checkUpdate([fresh, dangling])).toEqual([
        { index: 0, field: "flowId" },
      ])
      expect(await checkUpdate([dangling, fresh])).toEqual([
        { index: 1, field: "flowId" },
      ])
    })

    test("a duplicated copy of the dangling action is new and reported", async () => {
      expect(await checkUpdate([dangling, dangling])).toEqual([
        { index: 1, field: "flowId" },
      ])
    })
  })

  test("only the requested actions are checked", async () => {
    const actions = [
      { type: "startAnotherFlow", flowId: "99" },
      { type: "startAnotherFlow", flowId: "98" },
    ]

    expect(await check(actions, new Set([1]))).toEqual([
      { index: 1, field: "flowId" },
    ])
  })
})

describe("indexesOfNewActions", () => {
  const a = { type: "addTag", tagIds: ["1"] }
  const b = { type: "startAnotherFlow", flowId: "10" }

  test("nothing is new when the actions are unchanged", () => {
    expect([...indexesOfNewActions([a, b], [a, b])]).toEqual([])
  })

  test("reordering does not make anything new", () => {
    expect([...indexesOfNewActions([b, a], [a, b])]).toEqual([])
  })

  test("inserting an action in front only flags the inserted one", () => {
    const inserted = { type: "removeTag", tagIds: ["2"] }

    expect([...indexesOfNewActions([inserted, a, b], [a, b])]).toEqual([0])
  })

  test("a changed action is new", () => {
    expect([
      ...indexesOfNewActions([a, { ...b, flowId: "11" }], [a, b]),
    ]).toEqual([1])
  })

  test("a duplicate of a stored action is counted, so the copy is new", () => {
    expect([...indexesOfNewActions([a, a], [a])]).toEqual([1])
  })

  test("key order inside an action does not matter", () => {
    expect([
      ...indexesOfNewActions(
        [{ tagIds: ["1"], type: "addTag" }],
        [{ type: "addTag", tagIds: ["1"] }],
      ),
    ]).toEqual([])
  })

  test("removing actions leaves nothing new", () => {
    expect([...indexesOfNewActions([a], [a, b])]).toEqual([])
  })

  test("everything is new for a trigger with no stored actions", () => {
    expect([...indexesOfNewActions([a, b], [])]).toEqual([0, 1])
  })
})
