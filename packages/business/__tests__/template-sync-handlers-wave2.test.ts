// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { callsOn, makeFakeTx } from "./helpers/template-fake-tx"

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: {} },
  eq: (column: unknown, value: unknown) => ({ column, value }),
  inArray: (column: unknown, values: unknown) => ({ column, values }),
  isUniqueViolationError: () => false,
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  aiAgentModel: { table: "AIAgent" },
  triggerModel: { table: "Trigger" },
  conditionModel: { table: "Condition" },
  sequenceModel: { table: "Sequence" },
  sequenceStepModel: { table: "SequenceStep" },
  savedReplyModel: { table: "SavedReply" },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  mediaLibraryFileRepository: {},
  savedReplyImageRepository: {},
}))
vi.mock("@chatbotx.io/filesystem", () => ({ uploader: {} }))
vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock("../src/bot-field/service", () => ({ botFieldService: {} }))
let counter = 0
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: () => `new-${++counter}`,
}))

const { aiAgentsAdapter } = await import("../src/template/adapters/ai-agents")
const { triggersAdapter } = await import("../src/template/adapters/triggers")
const { sequencesAdapter } = await import("../src/template/adapters/sequences")
const { settingsAdapter } = await import("../src/template/adapters/settings")
const { fingerprintEntry } = await import("../src/template/fingerprint")
const { updateNotSupported, isUpdatable } = await import(
  "../src/template/adapters/shared"
)

const makeCtx = (
  tx: never,
  idMaps: Record<string, Map<string, string>> = {},
) => ({
  tx,
  workspaceId: "ws-1",
  installationId: "inst-1",
  idMaps,
  track: vi.fn(),
  warn: vi.fn(),
})

const rejection = async (promise: Promise<unknown>) =>
  await promise.then(
    () => null,
    (error: unknown) => error,
  )

beforeEach(() => {
  counter = 0
})

describe("aiAgents sync handler", () => {
  const agentRow = {
    id: "agent-1",
    workspaceId: "ws-1",
    name: "Support",
    prompt: "Be kind",
    messages: [{ role: "user", content: "hi" }],
    models: [{ provider: "openai", model: "gpt" }],
    temperature: 0.5,
    maxOutputTokens: 500,
    tools: ["fn:10"],
    isRichResponse: false,
    isDefault: true,
    webSearchAuthorizedDomains: ["a.com"],
  }
  const tables = () => ({ AIAgent: [agentRow] })

  test("update overwrites the content, remaps tools and never writes isDefault", async () => {
    const { tx, calls } = makeFakeTx(tables(), {})
    const ctx = makeCtx(tx, { aiFunction: new Map([["src-fn", "tgt-fn"]]) })

    await aiAgentsAdapter.sync.update(ctx, [
      {
        resourceId: "agent-1",
        entry: {
          sourceId: "src-agent",
          name: "Support v2",
          prompt: "Be brief",
          messages: [{ role: "user", content: "yo" }],
          models: [
            { provider: "openai", model: "gpt-5" },
            { kind: "openaiCompatible", integrationId: "x", model: "m" },
          ],
          temperature: 0.2,
          maxOutputTokens: 900,
          tools: ["fn:src-fn", "fn:gone"],
          isDefault: false,
          isRichResponse: true,
        },
      },
    ])

    const [update] = callsOn(calls, "update", "AIAgent")
    expect(update.set).toMatchObject({
      name: "Support v2",
      prompt: "Be brief",
      temperature: 0.2,
      maxOutputTokens: 900,
      isRichResponse: true,
      models: [{ provider: "openai", model: "gpt-5" }],
      webSearchAuthorizedDomains: [],
    })
    expect(update.set).not.toHaveProperty("isDefault")
    expect(update.set).not.toHaveProperty("actionRules")
    expect((update.set as { tools: string[] }).tools[0]).toBe("fn:tgt-fn")
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "aiAgents",
        entityKind: "integration",
      }),
    )
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "aiAgents",
        entityKind: "aiFunction",
      }),
    )
  })

  test("project leaves out the installer-owned isDefault", async () => {
    const { tx } = makeFakeTx(tables(), {})
    const projected = await aiAgentsAdapter.sync.project(tx, "agent-1")
    expect(projected).toMatchObject({ name: "Support", tools: ["fn:10"] })
    expect(projected).not.toHaveProperty("isDefault")
    expect(
      await aiAgentsAdapter.sync.project(makeFakeTx({}, {}).tx, "x"),
    ).toBeNull()
  })

  test("a backup restores what it saved, and refuses a foreign format or shape", async () => {
    const source = makeFakeTx(tables(), {})
    const backup = await aiAgentsAdapter.sync.serializeBackup(
      source.tx,
      "agent-1",
    )
    expect(backup?.formatVersion).toBe(1)

    const target = makeFakeTx(tables(), {})
    await aiAgentsAdapter.sync.restoreBackup(
      target.tx,
      "agent-1",
      backup?.content ?? {},
      1,
    )
    expect(callsOn(target.calls, "update", "AIAgent")[0].set).toMatchObject({
      name: "Support",
      messages: agentRow.messages,
    })

    const foreign = await rejection(
      aiAgentsAdapter.sync.restoreBackup(
        target.tx,
        "agent-1",
        backup?.content ?? {},
        99,
      ),
    )
    expect(foreign).toMatchObject({ code: "templateBackupNotRestorable" })
    expect(
      await rejection(
        aiAgentsAdapter.sync.restoreBackup(
          target.tx,
          "agent-1",
          { name: 1 },
          1,
        ),
      ),
    ).toBeInstanceOf(Error)
  })

  test("the fingerprint ignores isDefault and domain order but not message order", () => {
    const entry = (overrides: Record<string, unknown>) => ({
      sourceId: "a",
      name: "n",
      isDefault: true,
      webSearchAuthorizedDomains: ["a.com", "b.com"],
      messages: [{ content: "1" }, { content: "2" }],
      ...overrides,
    })
    const view = (overrides: Record<string, unknown>) =>
      JSON.stringify(
        fingerprintEntry(aiAgentsAdapter.fingerprint, entry(overrides)),
      )
    expect(view({ isDefault: false })).toBe(view({}))
    expect(view({ webSearchAuthorizedDomains: ["b.com", "a.com"] })).toBe(
      view({}),
    )
    expect(view({ messages: [{ content: "2" }, { content: "1" }] })).not.toBe(
      view({}),
    )
  })
})

describe("triggers sync handler", () => {
  const triggerRow = {
    id: "trg-1",
    workspaceId: "ws-1",
    name: "Welcome",
    actions: [{ type: "sendFlow", flowId: "1" }],
    active: true,
    folderId: "f-1",
  }
  const conditions = [
    {
      id: "c1",
      triggerId: "trg-1",
      type: "tag",
      sourceId: "9",
      operator: "is",
      value: { v: 1 },
    },
  ]
  const names = { triggerModel: "Trigger", conditionModel: "Condition" }

  test("update writes name and actions only, and keeps a name another trigger took", async () => {
    const { tx, calls } = makeFakeTx(
      { Trigger: [triggerRow, { ...triggerRow, id: "trg-2", name: "Taken" }] },
      names,
    )
    const ctx = makeCtx(tx)

    await triggersAdapter.sync.update(ctx, [
      {
        resourceId: "trg-1",
        entry: {
          sourceId: "src",
          name: "Taken",
          active: false,
          folderId: "src-folder",
          actions: [{ type: "wait" }],
        },
      },
    ])

    const [update] = callsOn(calls, "update", "Trigger")
    expect(update.set).toEqual({ name: "Welcome", actions: [{ type: "wait" }] })
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({ category: "triggers", entityKind: "name" }),
    )
  })

  test("a backup carries the condition rows and restore puts them back", async () => {
    const source = makeFakeTx(
      { Trigger: [triggerRow], Condition: conditions },
      names,
    )
    const backup = await triggersAdapter.sync.serializeBackup(
      source.tx,
      "trg-1",
    )
    expect(backup?.content).toMatchObject({
      name: "Welcome",
      active: true,
      conditions: [
        { type: "tag", sourceId: "9", operator: "is", value: { v: 1 } },
      ],
    })

    const target = makeFakeTx(
      { Trigger: [{ ...triggerRow, name: "Edited" }] },
      names,
    )
    await triggersAdapter.sync.restoreBackup(
      target.tx,
      "trg-1",
      backup?.content ?? {},
      backup?.formatVersion ?? 0,
    )
    expect(callsOn(target.calls, "update", "Trigger")[0].set).toMatchObject({
      name: "Welcome",
      active: true,
    })
    expect(callsOn(target.calls, "delete", "Condition")).toHaveLength(1)
    expect(callsOn(target.calls, "insert", "Condition")[0].values).toEqual([
      expect.objectContaining({
        triggerId: "trg-1",
        type: "tag",
        sourceId: "9",
      }),
    ])
  })

  test("restore switches a trigger back on that a sync switched off; an older backup leaves the flag alone", async () => {
    const backupContent = {
      name: "Welcome",
      actions: [],
      active: true,
      conditions: [],
    }
    const switchedOff = makeFakeTx(
      { Trigger: [{ ...triggerRow, active: false }] },
      names,
    )
    await triggersAdapter.sync.restoreBackup(
      switchedOff.tx,
      "trg-1",
      backupContent,
      1,
    )
    expect(
      callsOn(switchedOff.calls, "update", "Trigger")[0].set,
    ).toMatchObject({ active: true })

    const legacy = makeFakeTx(
      { Trigger: [{ ...triggerRow, active: false }] },
      names,
    )
    const { active: _active, ...legacyContent } = backupContent
    await triggersAdapter.sync.restoreBackup(
      legacy.tx,
      "trg-1",
      legacyContent,
      1,
    )
    expect(
      callsOn(legacy.calls, "update", "Trigger")[0].set,
    ).not.toHaveProperty("active")
  })

  test("restore refuses a foreign format version", async () => {
    const { tx } = makeFakeTx({ Trigger: [triggerRow] }, names)
    expect(
      await rejection(triggersAdapter.sync.restoreBackup(tx, "trg-1", {}, 7)),
    ).toMatchObject({ code: "templateBackupNotRestorable" })
  })

  test("the fingerprint drops active and folderId", () => {
    expect(
      triggersAdapter.fingerprint?.project?.({
        sourceId: "a",
        name: "n",
        active: true,
        folderId: "f",
        actions: [],
      }),
    ).toEqual({ sourceId: "a", name: "n", actions: [] })
  })
})

describe("sequences sync handler", () => {
  const seqRow = {
    id: "seq-1",
    workspaceId: "ws-1",
    name: "Drip",
    active: true,
    subscribers: 40,
    messages: 2,
  }
  const stepRow = (id: string, order: number) => ({
    id,
    sequenceId: "seq-1",
    order,
    delayDays: 1,
    delayMinutes: 0,
    delayUnit: "days",
    specificDateTime: null,
    isActive: true,
    anytime: true,
    sendTimeStart: null,
    sendTimeEnd: null,
    sendDays: null,
    flowId: null,
  })
  const names = {
    sequenceModel: "Sequence",
    sequenceStepModel: "SequenceStep",
    flowModel: "Flow",
  }
  const entrySteps = [1, 2, 3].map((order) => ({
    order,
    delayDays: order,
    delayMinutes: 0,
    delayUnit: "days",
    specificDateTime: null,
    isActive: true,
    anytime: true,
    sendTimeStart: null,
    sendTimeEnd: null,
    sendDays: null,
    flowId: order === 1 ? "src-flow" : null,
  }))

  test("update rewrites steps in place, keeps step ids, preserves counters", async () => {
    const { tx, calls } = makeFakeTx(
      {
        Sequence: [seqRow],
        SequenceStep: [stepRow("s1", 1), stepRow("s2", 2)],
      },
      names,
    )
    const ctx = makeCtx(tx, { flow: new Map([["src-flow", "tgt-flow"]]) })

    await sequencesAdapter.sync.update(ctx, [
      {
        resourceId: "seq-1",
        entry: {
          sourceId: "src",
          name: "Drip",
          active: false,
          folderId: null,
          steps: entrySteps,
        },
      },
    ])

    const stepUpdates = callsOn(calls, "update", "SequenceStep")
    expect(stepUpdates).toHaveLength(2)
    expect(stepUpdates[0].set).toMatchObject({
      order: 1,
      delayDays: 1,
      flowId: "tgt-flow",
    })
    expect(stepUpdates[0].where).toMatchObject({ value: "s1" })
    expect(stepUpdates[1].where).toMatchObject({ value: "s2" })
    expect(callsOn(calls, "insert", "SequenceStep")[0].values).toEqual([
      expect.objectContaining({ id: "new-1", sequenceId: "seq-1", order: 3 }),
    ])
    const sequenceWrites = callsOn(calls, "update", "Sequence").map(
      (call) => call.set,
    )
    expect(sequenceWrites).toContainEqual({ messages: 3 })
    for (const write of sequenceWrites) {
      expect(write).not.toHaveProperty("subscribers")
      expect(write).not.toHaveProperty("active")
    }
  })

  test("surplus steps are removed and an unresolvable flow is cleared with a warning", async () => {
    const { tx, calls } = makeFakeTx(
      {
        Sequence: [seqRow],
        SequenceStep: [stepRow("s1", 1), stepRow("s2", 2)],
      },
      names,
    )
    const ctx = makeCtx(tx)
    await sequencesAdapter.sync.update(ctx, [
      {
        resourceId: "seq-1",
        entry: {
          sourceId: "src",
          name: "Drip",
          active: true,
          folderId: null,
          steps: entrySteps.slice(0, 1),
        },
      },
    ])
    expect(callsOn(calls, "delete", "SequenceStep")).toHaveLength(1)
    expect(callsOn(calls, "update", "SequenceStep")[0].set).toMatchObject({
      flowId: null,
    })
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({ category: "sequences", entityKind: "flow" }),
    )
  })

  test("backup round trip restores steps; a step flow deleted since is cleared", async () => {
    const withFlow = { ...stepRow("s1", 1), flowId: "tgt-flow" }
    const source = makeFakeTx(
      { Sequence: [seqRow], SequenceStep: [withFlow] },
      names,
    )
    const backup = await sequencesAdapter.sync.serializeBackup(
      source.tx,
      "seq-1",
    )
    expect(backup?.content).toMatchObject({
      name: "Drip",
      steps: [{ order: 1, flowId: "tgt-flow" }],
    })

    // The flow no longer exists in the workspace.
    const target = makeFakeTx(
      { Sequence: [seqRow], SequenceStep: [stepRow("s9", 1)], Flow: [] },
      names,
    )
    await sequencesAdapter.sync.restoreBackup(
      target.tx,
      "seq-1",
      backup?.content ?? {},
      1,
    )
    expect(
      callsOn(target.calls, "update", "SequenceStep")[0].set,
    ).toMatchObject({ flowId: null })
    expect(
      await rejection(
        sequencesAdapter.sync.restoreBackup(
          target.tx,
          "seq-1",
          backup?.content ?? {},
          2,
        ),
      ),
    ).toMatchObject({ code: "templateBackupNotRestorable" })
    expect(
      await rejection(
        sequencesAdapter.sync.restoreBackup(
          target.tx,
          "seq-1",
          { steps: "no" },
          1,
        ),
      ),
    ).toBeInstanceOf(Error)
  })

  test("the fingerprint drops active, folder and counters but keeps step order", () => {
    const projected = sequencesAdapter.fingerprint?.project?.({
      sourceId: "a",
      name: "n",
      active: true,
      folderId: "f",
      subscribers: 3,
      messages: 2,
      steps: [{ order: 2 }, { order: 1 }],
    })
    expect(projected).toEqual({
      sourceId: "a",
      name: "n",
      steps: [{ order: 2 }, { order: 1 }],
    })
  })
})

describe("settings sync handler (saved replies)", () => {
  const tables = {
    SavedReply: [
      { id: "sr-1", workspaceId: "ws-1", shortcut: "hi", text: "Hello" },
    ],
  }

  test("update writes shortcut and text only; a bot field entry is ignored", async () => {
    const { tx, calls } = makeFakeTx(tables, {})
    await settingsAdapter.sync.update(makeCtx(tx), [
      {
        resourceId: "sr-1",
        entry: {
          sourceId: "a",
          kind: "savedReply",
          shortcut: "yo",
          text: "Yo!",
        },
      },
      {
        resourceId: "bf-1",
        entry: { sourceId: "b", kind: "botField", name: "n", type: "text" },
      },
    ])
    const updates = callsOn(calls, "update", "SavedReply")
    expect(updates).toHaveLength(1)
    expect(updates[0].set).toEqual({ shortcut: "yo", text: "Yo!" })
  })

  test("project, backup and restore round trip with format checks", async () => {
    const { tx, calls } = makeFakeTx(tables, {})
    expect(await settingsAdapter.sync.project(tx, "sr-1")).toEqual({
      shortcut: "hi",
      text: "Hello",
    })
    const backup = await settingsAdapter.sync.serializeBackup(tx, "sr-1")
    await settingsAdapter.sync.restoreBackup(
      tx,
      "sr-1",
      backup?.content ?? {},
      1,
    )
    expect(callsOn(calls, "update", "SavedReply")[0].set).toEqual({
      shortcut: "hi",
      text: "Hello",
    })
    expect(
      await rejection(settingsAdapter.sync.restoreBackup(tx, "sr-1", {}, 3)),
    ).toMatchObject({ code: "templateBackupNotRestorable" })
    expect(
      await rejection(
        settingsAdapter.sync.restoreBackup(tx, "sr-1", { text: 4 }, 1),
      ),
    ).toBeInstanceOf(Error)
  })

  test("the fingerprint ignores a bot field's folder", () => {
    expect(
      settingsAdapter.fingerprint?.project?.({
        kind: "botField",
        sourceId: "b",
        name: "n",
        folderId: "f",
      }),
    ).toEqual({ kind: "botField", sourceId: "b", name: "n" })
  })
})

describe("updateNotSupported", () => {
  test("warns once per category with the number of copies and never reads a copy", async () => {
    const handler = updateNotSupported("pipelines")
    const ctx = makeCtx({} as never)
    await handler.update(ctx, [
      { resourceId: "1", entry: { sourceId: "a" } },
      { resourceId: "2", entry: { sourceId: "b" } },
    ])
    expect(ctx.warn).toHaveBeenCalledWith({
      category: "pipelines",
      entityKind: "notUpdatable",
      path: "pipelines",
      value: "2",
    })
    expect(isUpdatable(handler)).toBe(false)
    expect(await handler.serializeBackup({} as never, "1")).toBeNull()
    expect(await rejection(handler.project({} as never, "1"))).toMatchObject({
      code: "templateBackupNotRestorable",
    })
  })
})
