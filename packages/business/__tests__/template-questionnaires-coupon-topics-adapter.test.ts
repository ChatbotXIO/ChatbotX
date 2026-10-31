// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  insertedByTable: new Map<string, Record<string, unknown>[]>(),
  updates: [] as { set: Record<string, unknown> }[],
  questionnaireFindMany: vi.fn(),
  questionFindMany: vi.fn(),
  topicFindMany: vi.fn(),
  copyObject: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      questionnaireModel: { findMany: mocks.questionnaireFindMany },
      questionnaireQuestionModel: { findMany: mocks.questionFindMany },
      couponTopicModel: { findMany: mocks.topicFindMany },
    },
  },
  eq: vi.fn(),
  and: vi.fn(),
  isUniqueViolationError: () => false,
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  questionnaireModel: { table: "questionnaire" },
  questionnaireQuestionModel: { table: "question" },
  couponTopicModel: { table: "topic" },
}))
let counter = 0
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { copyObject: mocks.copyObject },
}))
vi.mock("../src/logger", () => ({ logger: { warn: vi.fn() } }))
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: () => `new-${++counter}`,
  mapWithConcurrency: <T, R>(
    items: readonly T[],
    _concurrency: number,
    run: (item: T, index: number) => Promise<R>,
  ) => Promise.allSettled(items.map((item, index) => run(item, index))),
}))

const { questionnairesAdapter } = await import(
  "../src/template/adapters/questionnaires"
)
const { couponTopicsAdapter } = await import(
  "../src/template/adapters/coupon-topics"
)

const makeTx = () => {
  const tx: Record<string, unknown> = {
    insert: (model: { table: string }) => ({
      values: (values: unknown) => {
        const rows = (Array.isArray(values) ? values : [values]) as Record<
          string,
          unknown
        >[]
        mocks.insertedByTable.set(model.table, [
          ...(mocks.insertedByTable.get(model.table) ?? []),
          ...rows,
        ])
        return Object.assign(Promise.resolve(), {
          returning: () => Promise.resolve(rows),
        })
      },
    }),
    update: () => ({
      set: (set: Record<string, unknown>) => {
        mocks.updates.push({ set })
        return { where: () => Promise.resolve() }
      },
    }),
  }
  tx.transaction = (callback: (client: unknown) => unknown) => callback(tx)
  return tx
}

const makeCtx = (idMaps: Record<string, Map<string, string>> = {}) => {
  const warnings: { entityKind: string; path: string }[] = []
  const tracked: Record<string, unknown>[] = []
  return {
    ctx: {
      tx: makeTx(),
      workspaceId: "ws-1",
      installationId: "inst-1",
      idMaps,
      track: (entry: Record<string, unknown>) => tracked.push(entry),
      warn: (warning: { entityKind: string; path: string }) =>
        warnings.push(warning),
    },
    warnings,
    tracked,
  }
}

const question = (overrides: Record<string, unknown> = {}) => ({
  title: "Your name?",
  type: "text",
  active: true,
  image: { url: "" },
  orderNo: 0,
  point: 1,
  retryMessage: null,
  customFieldId: "src-cf",
  systemFieldKey: null,
  config: null,
  ...overrides,
})

const questionnaireEntry = (overrides: Record<string, unknown> = {}) => ({
  sourceId: "src-q",
  name: "Survey",
  enableScore: true,
  enableRetryMessages: false,
  enableCustomFieldMapping: true,
  triggerFlowId: "src-flow",
  questions: [question()],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.insertedByTable.clear()
  mocks.updates.length = 0
})

describe("questionnaires adapter", () => {
  test("copies questions, remaps the custom field and defers the trigger flow", async () => {
    const { ctx, tracked, warnings } = makeCtx({
      customField: new Map([["src-cf", "tgt-cf"]]),
    })
    const patches = await questionnairesAdapter.insert(
      ctx as never,
      [questionnaireEntry()] as never,
    )

    const [row] = mocks.insertedByTable.get("questionnaire") ?? []
    expect(row).toMatchObject({
      name: "Survey",
      workspaceId: "ws-1",
      triggerFlowId: null,
    })
    const [inserted] = mocks.insertedByTable.get("question") ?? []
    expect(inserted).toMatchObject({
      questionnaireId: row.id,
      customFieldId: "tgt-cf",
    })
    expect(tracked).toEqual([
      expect.objectContaining({
        resourceKind: "questionnaire",
        sourceResourceId: "src-q",
        wasExisting: false,
      }),
    ])
    expect(warnings).toEqual([])

    ctx.idMaps.flow = new Map([["src-flow", "tgt-flow"]])
    await patches[0].apply(ctx as never)
    expect(mocks.updates[0].set).toEqual({ triggerFlowId: "tgt-flow" })
  })

  test("drops an unresolvable custom field and a missing trigger flow with warnings", async () => {
    const { ctx, warnings } = makeCtx()
    const patches = await questionnairesAdapter.insert(
      ctx as never,
      [questionnaireEntry()] as never,
    )

    const [inserted] = mocks.insertedByTable.get("question") ?? []
    expect(inserted.customFieldId).toBeNull()
    await patches[0].apply(ctx as never)
    expect(mocks.updates).toEqual([])
    expect(warnings.map((w) => w.entityKind)).toEqual(["customField", "flow"])
  })

  test("collects live questions in order and skips deleted questionnaires", async () => {
    mocks.questionnaireFindMany.mockResolvedValue([
      {
        id: "q1",
        name: "Survey",
        enableScore: false,
        enableRetryMessages: false,
        enableCustomFieldMapping: true,
        triggerFlowId: null,
      },
    ])
    mocks.questionFindMany.mockResolvedValue([
      { ...question(), id: "a", questionnaireId: "q1" },
    ])
    const result = await questionnairesAdapter.collector.collect("ws-1", ["q1"])

    expect(mocks.questionnaireFindMany.mock.calls[0][0].where).toMatchObject({
      deletedAt: { isNull: true },
    })
    expect(mocks.questionFindMany.mock.calls[0][0].where).toMatchObject({
      deletedAt: { isNull: true },
    })
    expect(result.entries[0]).toMatchObject({ sourceId: "q1" })
    expect(result.entries[0].questions).toHaveLength(1)
  })
})

describe("coupon topics adapter", () => {
  test("installs configuration only, with no coupon history", async () => {
    const { ctx, tracked } = makeCtx()
    await couponTopicsAdapter.insert(
      ctx as never,
      [
        {
          sourceId: "src-topic",
          name: "Spring",
          description: "desc",
          expiresAt: "2027-01-01T00:00:00.000Z",
          status: "active",
        },
      ] as never,
    )

    const [row] = mocks.insertedByTable.get("topic") ?? []
    expect(row).toMatchObject({
      workspaceId: "ws-1",
      name: "Spring",
      createdById: null,
    })
    expect(row.expiresAt).toEqual(new Date("2027-01-01T00:00:00.000Z"))
    expect(row).not.toHaveProperty("hasEverHadCoupon")
    expect(ctx.idMaps.couponTopic.get("src-topic")).toBe(row.id)
    expect(tracked[0]).toMatchObject({ resourceKind: "couponTopic" })
  })

  test("a bot field token in the description follows the field once the fields resolved", async () => {
    mocks.updates.length = 0
    const { ctx } = makeCtx()
    const patches = await couponTopicsAdapter.insert(
      ctx as never,
      [
        {
          sourceId: "src-topic",
          name: "Spring",
          description: "Hello {{bot_field:src-bf}} and {{bot_field:other}}",
          expiresAt: null,
          status: "active",
        },
      ] as never,
    )
    const [row] = mocks.insertedByTable.get("topic") ?? []
    // Inserted before the fields exist: the source id is still in place.
    expect(row.description).toContain("{{bot_field:src-bf}}")
    expect(patches).toHaveLength(1)

    // The settings adapter has resolved the fields by the time patches run.
    await patches[0].apply({
      ...ctx,
      idMaps: { ...ctx.idMaps, botField: new Map([["src-bf", "new-bf"]]) },
    } as never)

    expect(mocks.updates).toHaveLength(1)
    expect(mocks.updates[0].set.description).toBe(
      "Hello {{bot_field:new-bf}} and {{bot_field:other}}",
    )
  })

  test("collect serialises expiry and excludes deleted topics", async () => {
    mocks.topicFindMany.mockResolvedValue([
      {
        id: "t1",
        name: "Spring",
        description: null,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        status: "active",
      },
    ])
    const result = await couponTopicsAdapter.collector.collect("ws-1", ["t1"])
    expect(mocks.topicFindMany.mock.calls[0][0].where).toMatchObject({
      deletedAt: { isNull: true },
    })
    expect(result.entries[0].expiresAt).toBe("2027-01-01T00:00:00.000Z")
  })
})

describe("coupon topics adapter: expired topic", () => {
  test("warns when the shipped expiry is already past", async () => {
    const { ctx, warnings } = makeCtx()
    await couponTopicsAdapter.insert(
      ctx as never,
      [
        {
          sourceId: "src-topic",
          name: "Old",
          description: null,
          expiresAt: "2020-01-01T00:00:00.000Z",
          status: "active",
        },
      ] as never,
    )
    expect(warnings.map((w) => w.entityKind)).toEqual(["couponTopicExpired"])
  })
})

const QUESTION_IMAGE_TARGET =
  /^public\/space\/ws-2\/questionnaire-images\/tpl-inst-1\/g0\/[0-9a-f]{64}$/

describe("questionnaires adapter: question images", () => {
  const OWN = "https://cdn.example/public/space/11/media/a.png"
  const imageQuestion = (url: string) =>
    question({ customFieldId: null, image: { mode: "file", url } })
  const stageCtx = {
    workspaceId: "ws-2",
    installationId: "inst-1",
    scope: { generation: 0 },
    sourceWorkspaceId: "11",
    trackCopiedObject: vi.fn(),
  }

  test("stages a copy of an image in the publisher's public storage at a deterministic key", async () => {
    mocks.copyObject.mockResolvedValue(undefined)
    const entry = questionnaireEntry({ questions: [imageQuestion(OWN)] })

    const first = await questionnairesAdapter.stage?.(stageCtx, [
      entry,
    ] as never)
    const second = await questionnairesAdapter.stage?.(stageCtx, [
      entry,
    ] as never)

    const staged = first?.get("questionnaires:src-q:0")
    expect(staged).toEqual({
      targetPath: expect.stringMatching(QUESTION_IMAGE_TARGET),
    })
    expect(second?.get("questionnaires:src-q:0")).toEqual(staged)
    expect(mocks.copyObject).toHaveBeenCalledWith(
      "public/space/11/media/a.png",
      (staged as { targetPath: string }).targetPath,
    )
    expect(stageCtx.trackCopiedObject).toHaveBeenCalledWith(
      (staged as { targetPath: string }).targetPath,
    )
  })

  test("never follows another workspace's path or an external link", async () => {
    const entry = questionnaireEntry({
      questions: [
        imageQuestion("https://cdn.example/public/space/99/media/a.png"),
        imageQuestion("https://example.com/cat.png"),
        imageQuestion("https://cdn.example/public/space/11/../99/a.png"),
      ],
    })

    const staged = await questionnairesAdapter.stage?.(stageCtx, [
      entry,
    ] as never)

    expect(mocks.copyObject).not.toHaveBeenCalled()
    expect(staged?.size).toBe(0)
  })

  test("insert points the question at the staged copy and keeps external links", async () => {
    const { ctx, warnings } = makeCtx()
    const staged = new Map([
      [
        "questionnaires:src-q:0",
        { targetPath: "public/space/ws-2/questionnaire-images/h" },
      ],
    ])
    const entry = questionnaireEntry({
      triggerFlowId: null,
      questions: [
        imageQuestion(OWN),
        { ...imageQuestion("https://example.com/cat.png"), orderNo: 1 },
      ],
    })

    await questionnairesAdapter.insert(
      { ...ctx, sourceWorkspaceId: "11", staged } as never,
      [entry] as never,
    )

    const rows = mocks.insertedByTable.get("question") ?? []
    expect(rows[0]?.image).toEqual({
      mode: "file",
      url: "https://cdn.example/public/space/ws-2/questionnaire-images/h",
    })
    expect(rows[1]?.image).toEqual({
      mode: "file",
      url: "https://example.com/cat.png",
    })
    expect(warnings).toEqual([])
    expect(mocks.copyObject).not.toHaveBeenCalled()
  })

  test("an image that could not be staged keeps its link with a warning", async () => {
    const { ctx, warnings } = makeCtx()
    const entry = questionnaireEntry({
      triggerFlowId: null,
      questions: [imageQuestion(OWN)],
    })

    await questionnairesAdapter.insert(
      { ...ctx, sourceWorkspaceId: "11", staged: new Map() } as never,
      [entry] as never,
    )

    expect((mocks.insertedByTable.get("question") ?? [])[0]?.image).toEqual({
      mode: "file",
      url: OWN,
    })
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "questionImage" }),
    ])
  })
})
