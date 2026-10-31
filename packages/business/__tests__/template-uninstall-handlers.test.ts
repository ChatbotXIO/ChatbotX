// @vitest-environment node

import type { DatabaseClient } from "@chatbotx.io/database/client"
import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/repositories", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    savedReplyImageRepository: {
      listBySavedReplyIds: vi.fn().mockResolvedValue([
        { savedReplyId: "5", mediaLibraryFileId: "m1" },
        { savedReplyId: "5", mediaLibraryFileId: "m2" },
      ]),
    },
    pipelineRepository: { delete: vi.fn().mockResolvedValue(true) },
  }
})
vi.mock("../src/questionnaire/service", () => ({
  questionnaireService: { deleteInTx: vi.fn().mockResolvedValue(undefined) },
}))
vi.mock("../src/workspace", () => ({
  workspaceService: { findById: vi.fn().mockResolvedValue({ ownerId: "o1" }) },
}))
vi.mock("../src/connection/state-service", () => ({
  connectionStateService: { disconnectInbox: vi.fn().mockResolvedValue({}) },
}))

const { UNINSTALL_HANDLER_BY_KIND } = await import(
  "../src/template/adapters/uninstall-handlers"
)
const {
  COLUMN_SLOTS,
  OWN_CHILD_TABLES,
  COPIED_REFERENCE_KINDS,
  INBOUND_REFERENCE_KINDS,
  JSON_CONTAINERS,
  findParentsWithOutsideDependents,
  isReferencedByRegistry,
  referenceSlotsOf,
  referencedParentsOf,
} = await import("../src/template/uninstall-references")
const schema = await import("@chatbotx.io/database/schema")
const { UNINSTALL_PARENT_TABLE } = await import(
  "../src/template/uninstall-parent-locks"
)
const { getTableConfig } = await import("drizzle-orm/pg-core")
const { REFERENCE_FIELD_ENTITY_KIND, REFERENCE_ARRAY_FIELD_ENTITY_KIND } =
  await import("@chatbotx.io/flow-config")
const { templateAdapterRegistry } = await import(
  "../src/template/adapters/registry"
)
const { SHARED_KINDS } = await import(
  "../src/template/adapters/manifests/kinds"
)

type FakeTx = DatabaseClient & { calls: string[] }

/** A chainable transaction fake: `delete`/`update` return `rows` from `returning`. */
const COMPLETED_STATUS = /completed/

const fakeTx = (rows: { id: string }[]): FakeTx => {
  const calls: string[] = []
  const chain = (name: string) => {
    calls.push(name)
    const node: Record<string, unknown> = {}
    node.set = () => node
    node.where = () => ({
      returning: () => Promise.resolve(rows),
    })
    return node
  }
  return {
    calls,
    delete: () => chain("delete"),
    update: () => chain("update"),
    execute: () => {
      calls.push("execute")
      return Promise.resolve({ rowCount: 0, rows: [] })
    },
    query: {
      aiFileModel: {
        findMany: () => Promise.resolve([{ id: "1", path: "ai/x.pdf" }]),
      },
      integrationWebchatModel: {
        findMany: () => Promise.resolve([{ id: "1", inboxId: "9" }]),
      },
    },
  } as unknown as FakeTx
}

const ctx = (tx: FakeTx, kind: string) => ({
  tx,
  workspaceId: "w1",
  kind: kind as never,
  installationId: "i1",
  installationIds: ["i1"],
})

describe("uninstall handler contract", () => {
  test("every copied kind a category tracks has a handler; shared manifests have none", () => {
    const tracked = Object.values(templateAdapterRegistry)
      .map((adapter) => adapter.trackedKind)
      .filter((kind): kind is NonNullable<typeof kind> => kind !== null)
    for (const kind of tracked) {
      expect(UNINSTALL_HANDLER_BY_KIND[kind], kind).toBeDefined()
    }
    // The settings category tracks saved replies on top of its own null kind.
    expect(UNINSTALL_HANDLER_BY_KIND.savedReply).toBeDefined()
    // `pipeline` is both a manifest kind (a flow's natural-key reference,
    // kept) and a copied category (deleted): the row's category tells them apart.
    for (const kind of SHARED_KINDS) {
      if (kind !== "pipeline") {
        expect(UNINSTALL_HANDLER_BY_KIND[kind as never], kind).toBeUndefined()
      }
    }
  })

  test("a kind that declares heavy children can drain them", () => {
    for (const [kind, handler] of Object.entries(UNINSTALL_HANDLER_BY_KIND)) {
      expect(Array.isArray(handler?.heavyChildren), kind).toBe(true)
      if ((handler?.heavyChildren.length ?? 0) > 0) {
        expect(handler?.drainHeavyChildren, kind).toBeTypeOf("function")
      }
    }
  })

  test("every registry slot that points at a copied kind is probed", async () => {
    const slotted = Object.entries({
      ...REFERENCE_FIELD_ENTITY_KIND,
      ...REFERENCE_ARRAY_FIELD_ENTITY_KIND,
    }).filter(([, kind]) => COPIED_REFERENCE_KINDS.includes(kind as never))
    expect(slotted.length).toBeGreaterThan(0)
    for (const [field, kind] of slotted) {
      const slots = referenceSlotsOf(kind)
      expect([...slots.scalars, ...slots.arrays], field).toContain(field)
      expect(isReferencedByRegistry(kind), kind).toBe(true)
      // The kind has a handler, an inbound-kind entry and issues a probe per container.
      expect(UNINSTALL_HANDLER_BY_KIND[kind as never], kind).toBeDefined()
      expect(INBOUND_REFERENCE_KINDS[kind as never], kind).toBeDefined()
      const executed: unknown[] = []
      const tx = {
        execute: (query: unknown) => {
          executed.push(query)
          return Promise.resolve({ rows: [] })
        },
      }
      await findParentsWithOutsideDependents(
        tx as never,
        kind as never,
        ["1"],
        new Set(),
        { workspaceId: "w1" },
      )
      const containers = JSON_CONTAINERS.filter(
        (container) =>
          !(container.conditionTypeColumn || container.contactFilterColumn),
      )
      expect(executed.length, kind).toBeGreaterThanOrEqual(containers.length)
    }
  })

  test("a probe finds a dependent outside the deleting set and ignores one inside", async () => {
    const outside = {
      execute: vi.fn(() => Promise.resolve({ rows: [{ parent: "1" }] })),
    }
    expect(
      await findParentsWithOutsideDependents(
        outside as never,
        "flow",
        ["1", "2"],
        new Set(),
        { workspaceId: "w1" },
      ),
    ).toEqual(new Set(["1"]))
    const none = { execute: vi.fn(() => Promise.resolve({ rows: [] })) }
    expect(
      await findParentsWithOutsideDependents(
        none as never,
        "flow",
        ["1"],
        new Set(["trigger:9"]),
        { workspaceId: "w1" },
      ),
    ).toEqual(new Set())
  })

  test("every probed table and column exists in the schema, and every holder kind has a handler", () => {
    const tables = new Map(
      Object.values(schema)
        .filter((value) => value && typeof value === "object")
        .flatMap((value) => {
          try {
            const config = getTableConfig(value as never)
            return config.name
              ? [
                  [
                    config.name,
                    new Set(config.columns.map((c) => c.name)),
                  ] as const,
                ]
              : []
          } catch {
            return []
          }
        }),
    )
    for (const slot of COLUMN_SLOTS) {
      expect(
        tables.get(slot.table)?.has(slot.column),
        slot.table + slot.column,
      ).toBe(true)
      if (slot.inboundKind) {
        expect(
          tables.get(slot.table)?.has(slot.inboundIdColumn ?? "id"),
          slot.table,
        ).toBe(true)
      }
      if (slot.workspaceColumn) {
        expect(
          tables.get(slot.table)?.has(slot.workspaceColumn),
          slot.table + slot.workspaceColumn,
        ).toBe(true)
      }
      if (slot.inboundKind) {
        expect(
          UNINSTALL_HANDLER_BY_KIND[slot.inboundKind],
          slot.inboundKind,
        ).toBeDefined()
      }
    }
    for (const container of JSON_CONTAINERS) {
      const columns = tables.get(container.table)
      for (const column of [
        ...container.jsonColumns,
        container.inboundIdColumn,
      ]) {
        expect(columns?.has(column), container.table + column).toBe(true)
      }
      if (container.inboundKind) {
        expect(UNINSTALL_HANDLER_BY_KIND[container.inboundKind]).toBeDefined()
      }
    }
  })

  test("JSON that stores flow ids outside the flow and trigger tables is probed", () => {
    const probed = new Set(
      JSON_CONTAINERS.flatMap((container) =>
        container.jsonColumns.map((column) => `${container.table}.${column}`),
      ),
    )
    for (const entry of [
      "IntegrationMessenger.persistentMenus",
      "IntegrationMessenger.conversationStarters",
      "IntegrationInstagram.persistentMenus",
      "IntegrationInstagram.conversationStarters",
      "Broadcast.templateData",
      "BroadcastTarget.templateData",
      "Broadcast.contactFilter",
      "DiscountCode.customerFilter",
    ]) {
      expect(probed.has(entry), entry).toBe(true)
    }
  })

  test("only the AI file handler repairs derived state when handed back, and records the reindex", async () => {
    const withHook = Object.entries(UNINSTALL_HANDLER_BY_KIND)
      .filter(([, handler]) => handler?.giveBack)
      .map(([kind]) => kind)
    expect(withHook).toEqual(["aiFile"])
    const tx = fakeTx([])

    const effects = await UNINSTALL_HANDLER_BY_KIND.aiFile?.giveBack?.(
      tx,
      ["f1", "f2"],
      {
        tx,
        workspaceId: "w1",
        kind: "aiFile",
        installationId: "i1",
        installationIds: ["i1"],
      },
    )

    // One statement for every id, not one UPDATE per file.
    expect(tx.calls.filter((call) => call === "update")).toHaveLength(1)
    expect(effects?.get("f1")).toEqual([
      { name: "aiFile.reindex", args: { workspaceId: "w1", aiFileId: "f1" } },
    ])
    expect(effects?.get("f2")?.[0]?.args.aiFileId).toBe("f2")
  })

  test("a missing row is absent, not a failure, and the rest are deleted", async () => {
    const handler = UNINSTALL_HANDLER_BY_KIND.trigger
    const tx = fakeTx([{ id: "1" }])
    const result = await handler?.uninstallDelete(
      tx,
      ["1", "2"],
      ctx(tx, "trigger"),
    )
    expect(result?.deleted).toEqual(["1"])
    expect(result?.absent).toEqual(["2"])
    expect(result?.effects.get("1")?.[0]?.name).toBe("trigger.invalidateCache")
  })

  test("flow delete records its welcome cleanup per flow instead of running it", async () => {
    const tx = fakeTx([{ id: "7" }])
    const result = await UNINSTALL_HANDLER_BY_KIND.flow?.uninstallDelete(
      tx,
      ["7"],
      ctx(tx, "flow"),
    )
    expect(result?.effects.get("7")).toEqual([
      {
        name: "flow.welcomeCleanup",
        args: { workspaceId: "w1", flowId: "7" },
      },
    ])
  })

  test("keywords of either type are deleted by id (the type is never assumed)", async () => {
    const tx = fakeTx([{ id: "3" }, { id: "4" }])
    const result =
      await UNINSTALL_HANDLER_BY_KIND.automatedResponse?.uninstallDelete(
        tx,
        ["3", "4"],
        ctx(tx, "automatedResponse"),
      )
    expect(result?.deleted).toEqual(["3", "4"])
  })

  test("knowledge files capture the stored object path before the row is gone", async () => {
    const tx = fakeTx([{ id: "1" }])
    const result = await UNINSTALL_HANDLER_BY_KIND.aiFile?.uninstallDelete(
      tx,
      ["1"],
      ctx(tx, "aiFile"),
    )
    expect(result?.effects.get("1")).toEqual([
      { name: "aiFile.deleteObject", args: { path: "ai/x.pdf" } },
    ])
  })

  test("calendars keep their soft delete (an update, never a delete)", async () => {
    const tx = fakeTx([{ id: "5" }])
    await UNINSTALL_HANDLER_BY_KIND.calendar?.uninstallDelete(
      tx,
      ["5"],
      ctx(tx, "calendar"),
    )
    expect(tx.calls).toEqual(["update"])
  })

  test("sequences drain dispatches then enrollments in bounded batches", async () => {
    const tx = fakeTx([])
    const more = await UNINSTALL_HANDLER_BY_KIND.sequence?.drainHeavyChildren?.(
      tx,
      ["1"],
      ctx(tx, "sequence"),
    )
    expect(more).toBe(false)
    expect(tx.calls.filter((call) => call === "execute")).toHaveLength(2)
  })

  test("a webchat records its inbox disconnect as a post-commit effect instead of running it in the transaction", async () => {
    const { connectionStateService } = await import(
      "../src/connection/state-service"
    )
    const tx = fakeTx([{ id: "1" }])
    const result =
      await UNINSTALL_HANDLER_BY_KIND.integrationWebchat?.uninstallDelete(
        tx,
        ["1"],
        ctx(tx, "integrationWebchat"),
      )
    expect(connectionStateService.disconnectInbox).not.toHaveBeenCalled()
    expect(result?.effects.get("1")).toEqual([
      expect.objectContaining({
        name: "webchat.disconnectInbox",
        args: expect.objectContaining({ inboxId: "9" }),
      }),
    ])
  })

  test("the registry walker finds the copied parents a trigger's actions point at", () => {
    const actions = [
      { type: "startFlow", flowId: "11" },
      { type: "subscribe", sequenceId: "22" },
      { type: "other", tagIds: ["33"], note: "99" },
      { type: "agent", tools: ["fn:44", "file:55", "free text fn:66"] },
    ]
    expect(referencedParentsOf(actions)).toEqual(
      expect.arrayContaining([
        { kind: "flow", resourceId: "11" },
        { kind: "sequence", resourceId: "22" },
        { kind: "aiFunction", resourceId: "44" },
        { kind: "aiFile", resourceId: "55" },
      ]),
    )
    // Tags are natural-key, never deleted by an uninstall, so never a parent.
    expect(
      referencedParentsOf(actions).some((parent) => parent.resourceId === "33"),
    ).toBe(false)
  })

  test("a saved reply records its image cleanup for after the commit", async () => {
    const tx = fakeTx([{ id: "5" }])
    const result = await UNINSTALL_HANDLER_BY_KIND.savedReply?.uninstallDelete(
      tx,
      ["5"],
      ctx(tx, "savedReply"),
    )
    expect(result?.effects.get("5")).toEqual([
      {
        name: "savedReply.deleteImages",
        args: { workspaceId: "w1", installationId: "i1", fileIds: "m1,m2" },
      },
    ])
  })

  test("a pipeline records its structure-changed notice for after the commit", async () => {
    const tx = fakeTx([])
    const result = await UNINSTALL_HANDLER_BY_KIND.pipeline?.uninstallDelete(
      tx,
      ["8"],
      ctx(tx, "pipeline"),
    )
    expect(result?.effects.get("8")).toEqual([
      {
        name: "pipeline.afterStructureChange",
        args: { workspaceId: "w1", pipelineId: "8" },
      },
    ])
  })

  test("every foreign key that points at a copied kind is a probed dependent or a declared own child", () => {
    // Derived from the handlers, so a new copied kind is covered by construction.
    const copiedTables = new Set(
      Object.keys(UNINSTALL_HANDLER_BY_KIND).map(
        (kind) => UNINSTALL_PARENT_TABLE[kind as never] as string,
      ),
    )
    expect(copiedTables.has(undefined as never)).toBe(false)
    const known = new Set(
      [...COLUMN_SLOTS, ...OWN_CHILD_TABLES].map(
        (entry) => `${entry.table}.${entry.column}`,
      ),
    )
    const unlisted: string[] = []
    for (const value of Object.values(schema)) {
      let config: ReturnType<typeof getTableConfig>
      try {
        config = getTableConfig(value as never)
      } catch {
        continue
      }
      for (const foreignKey of config.foreignKeys) {
        const reference = foreignKey.reference()
        const target = getTableConfig(reference.foreignTable).name
        if (!copiedTables.has(target)) {
          continue
        }
        for (const column of reference.columns) {
          if (!known.has(`${config.name}.${column.name}`)) {
            unlisted.push(`${config.name}.${column.name} -> ${target}`)
          }
        }
      }
    }
    // A new foreign key to a copied kind must be probed (COLUMN_SLOTS) or
    // declared an own child (OWN_CHILD_TABLES): otherwise an uninstall could
    // cascade away or null out installer data without keeping the parent.
    expect(unlisted).toEqual([])
  })

  test.each([
    ["flow", 3],
    ["trigger", 3],
    ["fbCommentAutomation", 3],
    ["reflink", 1],
    ["sequence", 2],
    ["aiFile", 1],
  ])("%s drains its heavy children in %i bounded, workspace-scoped batches", async (kind, batches) => {
    const statements: string[] = []
    const tx = {
      execute: (query: { queryChunks?: unknown[] }) => {
        statements.push(JSON.stringify(query))
        return Promise.resolve({ rowCount: 0, rows: [] })
      },
    }
    const more = await UNINSTALL_HANDLER_BY_KIND[
      kind as never
    ]?.drainHeavyChildren?.(tx as never, ["1"], {
      tx,
      workspaceId: "w1",
      kind: kind as never,
      installationId: "i1",
      installationIds: ["i1"],
    } as never)
    expect(more).toBe(false)
    expect(statements).toHaveLength(batches)
    for (const statement of statements) {
      expect(statement).toContain("workspaceId")
      expect(statement).toContain("LIMIT")
    }
  })

  test("a pipeline never drains deals: it asks for dependents instead (the PipelineItem slot)", async () => {
    const handler = UNINSTALL_HANDLER_BY_KIND.pipeline
    expect(handler?.heavyChildren).not.toContain("PipelineItem")
    const executed: string[] = []
    const tx = {
      execute: (query: unknown) => {
        executed.push(JSON.stringify(query))
        return Promise.resolve({ rows: [{ parent: "8" }] })
      },
    }
    const kept = await handler?.protectedDependents(
      tx as never,
      ["8"],
      new Set(),
      { workspaceId: "w1" },
    )
    expect(kept).toEqual(new Set(["8"]))
    expect(
      executed.some((statement) => statement.includes("PipelineItem")),
    ).toBe(true)
  })

  test("flow nodes that point at other copied kinds are found by the registry walker (a flow save locks them)", () => {
    const nodes = [
      { id: "n1", data: { flowId: "11" } },
      { id: "n2", data: { sequenceId: "22", calendarId: "33" } },
    ]
    expect(referencedParentsOf(nodes)).toEqual(
      expect.arrayContaining([
        { kind: "flow", resourceId: "11" },
        { kind: "sequence", resourceId: "22" },
        { kind: "calendar", resourceId: "33" },
      ]),
    )
  })

  test("every handler's kind has a parent table to lock, and that table is real", () => {
    const names = new Set(
      Object.values(schema).flatMap((value) => {
        try {
          return [getTableConfig(value as never).name]
        } catch {
          return []
        }
      }),
    )
    for (const kind of Object.keys(UNINSTALL_HANDLER_BY_KIND)) {
      const table = UNINSTALL_PARENT_TABLE[kind as never]
      expect(table, kind).toBeDefined()
      expect(names.has(table as string), String(table)).toBe(true)
    }
  })

  test("freezing returns the prior flags, and unfreezing restores only where the value is still frozen", async () => {
    const updates: { set: unknown }[] = []
    const tx = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ id: "7", value: true }]),
        }),
      }),
      update: () => ({
        set: (set: unknown) => {
          updates.push({ set })
          return {
            where: () => ({ returning: () => Promise.resolve([{ id: "7" }]) }),
          }
        },
      }),
    }
    const handler = UNINSTALL_HANDLER_BY_KIND.trigger
    const c = ctx(tx as never, "trigger")
    const prior = await handler?.freeze(tx as never, ["7"], c)
    expect(prior?.get("7")).toEqual({ active: true })

    const effects = await handler?.unfreeze(
      tx as never,
      [{ resourceId: "7", frozenFrom: { active: true } }],
      c,
    )
    expect(updates.at(-1)?.set).toEqual({ active: true })
    expect(effects?.get("7")?.[0]?.name).toBe("trigger.invalidateCache")
  })

  test("a copy that was inactive before the freeze stays inactive (nothing to restore)", async () => {
    const tx = {
      update: vi.fn(),
    }
    const effects = await UNINSTALL_HANDLER_BY_KIND.trigger?.unfreeze(
      tx as never,
      [{ resourceId: "7", frozenFrom: { active: false } }],
      ctx(tx as never, "trigger"),
    )
    expect(tx.update).not.toHaveBeenCalled()
    expect(effects?.size).toBe(0)
  })

  test("EVERY copied kind the reference registry or a column slot points at uses the slot probe, not noDependents", () => {
    const referenced = COPIED_REFERENCE_KINDS.filter(
      (kind) =>
        UNINSTALL_HANDLER_BY_KIND[kind] &&
        (isReferencedByRegistry(kind) ||
          COLUMN_SLOTS.some((slot) => slot.parent === kind)),
    )
    expect(referenced.length).toBeGreaterThan(8)
    expect(referenced).toContain("sequence")
    for (const kind of referenced) {
      const check = UNINSTALL_HANDLER_BY_KIND[kind]?.protectedDependents as
        | { probedKind?: string }
        | undefined
      expect(check?.probedKind, kind).toBe(kind)
    }
  })

  test("the drains cover every child of a kind, always scoped by workspace and never narrowed to history", async () => {
    const statements: string[] = []
    const tx = {
      execute: (query: unknown) => {
        statements.push(JSON.stringify(query))
        return Promise.resolve({ rowCount: 0, rows: [] })
      },
    }
    await UNINSTALL_HANDLER_BY_KIND.sequence?.drainHeavyChildren?.(
      tx as never,
      ["1"],
      ctx(tx as never, "sequence"),
    )
    expect(statements).toHaveLength(2)
    for (const statement of statements) {
      expect(statement).toContain("workspaceId")
      expect(statement).not.toMatch(COMPLETED_STATUS)
    }
    expect(UNINSTALL_HANDLER_BY_KIND.flow?.heavyChildren).toContain(
      "FlowVersion",
    )
    expect(UNINSTALL_HANDLER_BY_KIND.trigger?.heavyChildren).toContain(
      "TriggerContactHistory",
    )
  })
})

describe("one delete implementation per kind", () => {
  test("every copied kind's uninstall delete runs the service's own deleteInTx core inside the given tx", async () => {
    const cores = {
      flow: (await import("../src/flow/service")).flowService,
      trigger: (await import("../src/trigger/service")).triggerService,
      automatedResponse: (await import("../src/automated-response/service"))
        .automatedResponseService,
      sequence: (await import("../src/sequence/service")).sequenceService,
      calendar: (await import("../src/appointment-calendar/service"))
        .appointmentCalendarService,
      integrationWebchat: (await import("../src/integration-webchat/service"))
        .integrationWebchatService,
      fbCommentAutomation: (await import("../src/comment-automation/service"))
        .commentAutomationService,
      reflink: (await import("../src/reflink/service")).reflinkService,
      product: (await import("../src/product/service")).productService,
      savedReply: (await import("../src/saved-reply/service"))
        .savedReplyService,
      pipeline: (await import("../src/pipeline/service")).pipelineService,
      aiMcpServer: (await import("../src/ai-mcp-server/service"))
        .aiMcpServerService,
      aiFile: (await import("../src/ai-file/service")).aiFileService,
      aiAgent: (await import("../src/ai-agent/service")).aiAgentService,
      aiFunction: (await import("../src/ai-function/service"))
        .aiFunctionService,
    }
    // These cores return their deleted rows; every other one returns the ids.
    const returnsRows = new Set(["aiMcpServer", "aiFunction"])
    for (const [kind, service] of Object.entries(cores)) {
      // Only "1" is deleted: "2" was already gone and must count as absent.
      const core = vi
        .spyOn(
          service as { deleteInTx: (...args: never[]) => unknown },
          "deleteInTx",
        )
        .mockResolvedValue(
          (returnsRows.has(kind) ? [{ id: "1" }] : ["1"]) as never,
        )
      const tx = fakeTx([])
      const result = await UNINSTALL_HANDLER_BY_KIND[
        kind as never
      ]?.uninstallDelete(tx, ["1", "2"], ctx(tx, kind))
      expect(core, kind).toHaveBeenCalledWith(tx, {
        workspaceId: "w1",
        ids: ["1", "2"],
      })
      expect(result?.deleted, kind).toEqual(["1"])
      expect(result?.absent, kind).toEqual(["2"])
      core.mockRestore()
    }
    const { couponService } = await import("../src/coupon/service")
    const topicCore = vi
      .spyOn(couponService, "deleteTopicsInTx")
      .mockResolvedValue([{ id: "1" }] as never)
    const tx = fakeTx([])
    const topics = await UNINSTALL_HANDLER_BY_KIND.couponTopic?.uninstallDelete(
      tx,
      ["1", "2"],
      ctx(tx, "couponTopic"),
    )
    // An uninstall removes the installed topic in any state, not archived ones only.
    expect(topicCore).toHaveBeenCalledWith(tx, {
      workspaceId: "w1",
      ids: ["1", "2"],
      archivedOnly: false,
    })
    expect(topics?.deleted).toEqual(["1"])
    expect(topics?.absent).toEqual(["2"])
  })
})
