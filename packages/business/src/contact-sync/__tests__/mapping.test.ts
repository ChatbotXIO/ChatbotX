import { beforeEach, describe, expect, test, vi } from "vitest"

type Row = Record<string, unknown>

const mocks = vi.hoisted(() => ({
  findInboxes: vi.fn(),
  discover: vi.fn(),
  isConfigured: vi.fn(),
  tagRows: vi.fn(),
  fieldRows: vi.fn(),
  execute: vi.fn(),
  listSchema: vi.fn(),
  listForExternalIds: vi.fn(),
  deleteByExternalIds: vi.fn(),
  deleteStaleTagMappings: vi.fn(),
  upsertManual: vi.fn(),
  insertAutoAndRead: vi.fn(),
  upsertByNames: vi.fn(),
  invalidateWorkspaceTags: vi.fn(),
  resolveByNameAndType: vi.fn(),
}))

const tables = vi.hoisted(() => ({
  tag: null as unknown,
  field: null as unknown,
}))

/** `db.select().from(table).where(...)` resolving to the rows of that table. */
const selectChain = () => ({
  from: (table: unknown) => {
    const rows = () => {
      if (table === tables.tag) {
        return mocks.tagRows()
      }
      if (table === tables.field) {
        return mocks.fieldRows()
      }
      return []
    }
    const query = {
      where: () => query,
      orderBy: () => rows(),
      // biome-ignore lint/suspicious/noThenProperty: awaited like a drizzle query
      then: (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(rows()).then(resolve, reject),
    }
    return query
  },
})

vi.mock("@chatbotx.io/database/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/client")>()
  const tx = { execute: mocks.execute }
  return {
    ...actual,
    db: {
      select: selectChain,
      transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    },
  }
})
vi.mock("@chatbotx.io/database/repositories", () => ({
  contactSyncRunRepository: {},
  contactSyncMappingRepository: {
    listForExternalIds: mocks.listForExternalIds,
    deleteByExternalIds: mocks.deleteByExternalIds,
    deleteStaleTagMappings: mocks.deleteStaleTagMappings,
    upsertManual: mocks.upsertManual,
    insertAutoAndRead: mocks.insertAutoAndRead,
  },
}))
vi.mock("../providers", () => ({
  contactSyncAdapters: {
    ahachat: {
      provider: "ahachat",
      isConfigured: mocks.isConfigured,
      discoverPages: mocks.discover,
      listSchema: mocks.listSchema,
    },
  },
}))
vi.mock("../source-inboxes", () => ({
  findContactSyncInboxes: mocks.findInboxes,
  listContactSyncInboxes: vi.fn(),
}))
vi.mock("../../coexist/service", () => ({ coexistService: {} }))
vi.mock("../../workspace-lifecycle/with-blocked-owner-guard", () => ({
  resolveWorkspaceFreezeReasonById: vi.fn(),
}))
vi.mock("../../tag/service", () => ({
  tagService: {
    upsertByNames: mocks.upsertByNames,
    invalidateWorkspaceTags: mocks.invalidateWorkspaceTags,
  },
}))
vi.mock("../../custom-field/service", () => ({
  customFieldService: { resolveByNameAndType: mocks.resolveByNameAndType },
}))
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  integrationQueue: { add: vi.fn() },
}))

const schemaTables = await import("@chatbotx.io/database/schema")
tables.tag = schemaTables.tagModel
tables.field = schemaTables.customFieldModel

const { contactSyncService } = await import("../service")
const { clearDiscoveryCache } = await import("../discovery-cache")
const { ContactSyncMappingError } = await import("../errors")
const { resolveUnmappedFields, resolveUnmappedTags } = await import(
  "../mapping"
)

const WORKSPACE = "ws-1"
const ACTOR = { type: "user" as const, id: "user-1" }
const SCOPE = {
  workspaceId: WORKSPACE,
  page: {
    provider: "ahachat" as const,
    channel: "messenger" as const,
    pageId: "p1",
  },
}
const EMPTY_STATE = { tags: new Map(), fields: new Map() }

const mappingRow = (overrides: Row): Row => ({
  externalName: "x",
  tagId: null,
  customFieldId: null,
  origin: "auto",
  ...overrides,
})

const saveAndCatch = async (input: {
  inboxId?: string
  tags?: Parameters<typeof contactSyncService.saveMappings>[0]["tags"]
  fields?: Parameters<typeof contactSyncService.saveMappings>[0]["fields"]
}) =>
  contactSyncService
    .saveMappings({
      workspaceId: WORKSPACE,
      actor: ACTOR,
      inboxId: input.inboxId ?? "i1",
      tags: input.tags,
      fields: input.fields,
    })
    .then(
      () => null,
      (caught: unknown) => caught,
    )

beforeEach(() => {
  vi.resetAllMocks()
  clearDiscoveryCache()
  mocks.isConfigured.mockReturnValue(true)
  mocks.findInboxes.mockImplementation((_workspaceId: string, ids: string[]) =>
    Promise.resolve(
      ids.includes("i1")
        ? [{ id: "i1", name: "I", channel: "messenger", sourceId: "p1" }]
        : [],
    ),
  )
  mocks.discover.mockResolvedValue([
    {
      channel: "messenger",
      pageId: "p1",
      status: "found",
      name: "P",
      avatarUrl: null,
    },
  ])
  mocks.listSchema.mockResolvedValue({
    tags: [
      { id: "t1", name: "VIP" },
      { id: "t2", name: "Lead" },
    ],
    fields: [
      { id: "f1", name: "City", type: "text" },
      { id: "f2", name: "Age", type: "number" },
    ],
  })
  mocks.tagRows.mockResolvedValue([])
  mocks.fieldRows.mockResolvedValue([])
  mocks.listForExternalIds.mockResolvedValue([])
  mocks.deleteByExternalIds.mockResolvedValue(undefined)
  mocks.deleteStaleTagMappings.mockResolvedValue(undefined)
  mocks.upsertManual.mockResolvedValue(undefined)
})

describe("contactSyncService.saveMappings", () => {
  test("rejects a tag id that is not in the workspace", async () => {
    mocks.tagRows.mockResolvedValue([{ id: "tag-own", name: "Own" }])

    const error = await saveAndCatch({
      tags: [{ externalId: "t1", target: { tagId: "tag-other-ws" } }],
    })

    expect(error).toBeInstanceOf(ContactSyncMappingError)
    expect(
      (error as InstanceType<typeof ContactSyncMappingError>).issues,
    ).toEqual([{ kind: "tag", externalId: "t1", reason: "targetNotFound" }])
    expect(mocks.upsertManual).not.toHaveBeenCalled()
  })

  test("resolves a tag by id and by exact case-sensitive name", async () => {
    mocks.tagRows.mockResolvedValue([
      { id: "tag-1", name: "Vip" },
      { id: "tag-2", name: "Lead" },
    ])

    const error = await saveAndCatch({
      tags: [
        { externalId: "t1", target: { tagId: "tag-1" } },
        { externalId: "t2", target: { tagName: "Lead" } },
      ],
    })

    expect(error).toBeNull()
    expect(mocks.upsertManual).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [
          {
            kind: "tag",
            externalId: "t1",
            externalName: "VIP",
            tagId: "tag-1",
            customFieldId: null,
          },
          {
            kind: "tag",
            externalId: "t2",
            externalName: "Lead",
            tagId: "tag-2",
            customFieldId: null,
          },
        ],
      }),
      expect.anything(),
    )
  })

  test("rejects a tag name that differs by case or does not exist", async () => {
    mocks.tagRows.mockResolvedValue([{ id: "tag-1", name: "Vip" }])

    const error = await saveAndCatch({
      tags: [
        { externalId: "t1", target: { tagName: "vip" } },
        { externalId: "t2", target: { tagName: "Nope" } },
      ],
    })

    expect(
      (error as InstanceType<typeof ContactSyncMappingError>).issues,
    ).toEqual([
      { kind: "tag", externalId: "t1", reason: "targetNotFound" },
      { kind: "tag", externalId: "t2", reason: "targetNotFound" },
    ])
  })

  test("resolves a field by id and by name plus type", async () => {
    mocks.fieldRows.mockResolvedValue([
      { id: "cf-1", name: "Town", type: "shortText" },
      { id: "cf-2", name: "Age", type: "number" },
      { id: "cf-3", name: "Age", type: "shortText" },
    ])

    const error = await saveAndCatch({
      fields: [
        { externalId: "f1", target: { customFieldId: "cf-1" } },
        {
          externalId: "f2",
          target: { customFieldName: "Age", customFieldType: "number" },
        },
      ],
    })

    expect(error).toBeNull()
    expect(mocks.upsertManual).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [
          {
            kind: "customField",
            externalId: "f1",
            externalName: "City",
            tagId: null,
            customFieldId: "cf-1",
          },
          {
            kind: "customField",
            externalId: "f2",
            externalName: "Age",
            tagId: null,
            customFieldId: "cf-2",
          },
        ],
      }),
      expect.anything(),
    )
  })

  test("rejects a field whose type is not compatible with the source type", async () => {
    mocks.fieldRows.mockResolvedValue([
      { id: "cf-n", name: "Num", type: "number" },
    ])

    const error = await saveAndCatch({
      fields: [{ externalId: "f1", target: { customFieldId: "cf-n" } }],
    })

    expect(
      (error as InstanceType<typeof ContactSyncMappingError>).issues,
    ).toEqual([
      { kind: "customField", externalId: "f1", reason: "typeMismatch" },
    ])
  })

  test("rejects an unknown field id and an unknown name/type pair", async () => {
    mocks.fieldRows.mockResolvedValue([
      { id: "cf-1", name: "Town", type: "shortText" },
    ])

    const error = await saveAndCatch({
      fields: [
        { externalId: "f1", target: { customFieldId: "cf-other-ws" } },
        {
          externalId: "f2",
          target: { customFieldName: "Town", customFieldType: "number" },
        },
      ],
    })

    expect(
      (error as InstanceType<typeof ContactSyncMappingError>).issues,
    ).toEqual([
      { kind: "customField", externalId: "f1", reason: "targetNotFound" },
      { kind: "customField", externalId: "f2", reason: "targetNotFound" },
    ])
  })

  test("reports every bad row of tags and fields in one error", async () => {
    mocks.tagRows.mockResolvedValue([{ id: "tag-1", name: "Vip" }])
    mocks.fieldRows.mockResolvedValue([
      { id: "cf-n", name: "Num", type: "number" },
    ])

    const error = await saveAndCatch({
      tags: [
        { externalId: "t1", target: { tagId: "missing" } },
        { externalId: "t-unknown", target: null },
        { externalId: "t2", target: { tagId: "tag-1" } },
      ],
      fields: [
        { externalId: "f1", target: { customFieldId: "cf-n" } },
        { externalId: "f-unknown", target: null },
      ],
    })

    expect(error).toBeInstanceOf(ContactSyncMappingError)
    expect(
      (error as InstanceType<typeof ContactSyncMappingError>).issues,
    ).toEqual([
      { kind: "tag", externalId: "t1", reason: "targetNotFound" },
      { kind: "tag", externalId: "t-unknown", reason: "unknownExternalId" },
      { kind: "customField", externalId: "f1", reason: "typeMismatch" },
      {
        kind: "customField",
        externalId: "f-unknown",
        reason: "unknownExternalId",
      },
    ])
    expect(mocks.upsertManual).not.toHaveBeenCalled()
    expect(mocks.deleteByExternalIds).not.toHaveBeenCalled()
  })

  test("a null target removes the mapping instead of upserting it", async () => {
    const error = await saveAndCatch({
      tags: [{ externalId: "t1", target: null }],
      fields: [{ externalId: "f1", target: null }],
    })

    expect(error).toBeNull()
    expect(mocks.upsertManual).toHaveBeenCalledWith(
      { ...SCOPE, rows: [] },
      expect.anything(),
    )
    expect(mocks.deleteByExternalIds).toHaveBeenCalledWith(
      { ...SCOPE, kind: "tag", externalIds: ["t1"] },
      expect.anything(),
    )
    expect(mocks.deleteByExternalIds).toHaveBeenCalledWith(
      { ...SCOPE, kind: "customField", externalIds: ["f1"] },
      expect.anything(),
    )
    // Removals name no target: no tag or field is read for them.
    expect(mocks.tagRows).not.toHaveBeenCalled()
    expect(mocks.fieldRows).not.toHaveBeenCalled()
  })

  test("rejects a page that is not a source of this workspace", async () => {
    const error = await saveAndCatch({
      inboxId: "i-other-ws",
      tags: [{ externalId: "t1", target: null }],
    })

    expect(error).toMatchObject({
      code: "contactSyncSourceNotFound",
      httpStatusCode: 404,
    })
    expect(error).not.toBeInstanceOf(ContactSyncMappingError)
    expect(mocks.upsertManual).not.toHaveBeenCalled()
  })
})

describe("contactSyncService.getSchema", () => {
  test("returns source tags and fields with their current mapping", async () => {
    mocks.listForExternalIds.mockResolvedValue([
      mappingRow({
        kind: "tag",
        externalId: "t1",
        tagId: "tag-1",
        origin: "manual",
      }),
      mappingRow({
        kind: "customField",
        externalId: "f1",
        customFieldId: "cf-1",
        origin: "manual",
      }),
      mappingRow({
        kind: "customField",
        externalId: "f2",
        customFieldId: "cf-2",
        origin: "auto",
      }),
    ])
    mocks.tagRows.mockResolvedValue([{ id: "tag-1", name: "Vip" }])
    mocks.fieldRows.mockResolvedValue([
      { id: "cf-1", name: "Town", type: "shortText" },
      { id: "cf-2", name: "Age text", type: "shortText" },
    ])

    const schema = await contactSyncService.getSchema({
      workspaceId: WORKSPACE,
      actor: ACTOR,
      inboxId: "i1",
    })

    expect(schema.tags).toEqual([
      {
        id: "t1",
        name: "VIP",
        mapping: { tagId: "tag-1", tagName: "Vip", origin: "manual" },
      },
      { id: "t2", name: "Lead", mapping: null },
    ])
    expect(schema.fields[0]).toMatchObject({
      id: "f1",
      defaultTargetType: "shortText",
      compatibleTargetTypes: ["shortText", "longText", "email", "phoneNumber"],
      mapping: {
        customFieldId: "cf-1",
        customFieldName: "Town",
        customFieldType: "shortText",
        typeMismatch: false,
      },
    })
    expect(schema.fields[1]).toMatchObject({
      id: "f2",
      defaultTargetType: "number",
      mapping: { customFieldId: "cf-2", origin: "auto", typeMismatch: true },
    })
  })

  test("a page of another workspace is not found", async () => {
    await expect(
      contactSyncService.getSchema({
        workspaceId: WORKSPACE,
        actor: ACTOR,
        inboxId: "i-other-ws",
      }),
    ).rejects.toMatchObject({
      code: "contactSyncSourceNotFound",
      httpStatusCode: 404,
    })
  })
})

describe("resolveUnmappedTags", () => {
  const tags = [
    { id: "t1", name: "VIP" },
    { id: "t2", name: "Lead" },
  ]

  test("upserts unmapped tags by name and stores them as auto mappings", async () => {
    mocks.upsertByNames.mockResolvedValue([
      { id: "tag-1", name: "VIP" },
      { id: "tag-2", name: "Lead" },
    ])
    mocks.insertAutoAndRead.mockImplementation(async (input: { rows: Row[] }) =>
      input.rows.map((row) => ({ ...row, origin: "auto" })),
    )

    const state = await resolveUnmappedTags({
      scope: SCOPE,
      state: EMPTY_STATE,
      tags,
    })

    expect(mocks.upsertByNames).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      names: ["VIP", "Lead"],
    })
    // New tags show up in the cached tag lists at once.
    expect(mocks.invalidateWorkspaceTags).toHaveBeenCalledWith(WORKSPACE)
    expect(mocks.insertAutoAndRead).toHaveBeenCalledWith({
      ...SCOPE,
      rows: [
        {
          kind: "tag",
          externalId: "t1",
          externalName: "VIP",
          tagId: "tag-1",
          customFieldId: null,
        },
        {
          kind: "tag",
          externalId: "t2",
          externalName: "Lead",
          tagId: "tag-2",
          customFieldId: null,
        },
      ],
    })
    expect(state.tags.get("t1")).toEqual({ tagId: "tag-1", origin: "auto" })
    expect(state.tags.get("t2")).toEqual({ tagId: "tag-2", origin: "auto" })
  })

  test("an existing manual mapping read back wins over the auto insert", async () => {
    mocks.upsertByNames.mockResolvedValue([{ id: "tag-1", name: "VIP" }])
    mocks.insertAutoAndRead.mockResolvedValue([
      {
        kind: "tag",
        externalId: "t1",
        tagId: "tag-manual",
        customFieldId: null,
        origin: "manual",
      },
    ])

    const state = await resolveUnmappedTags({
      scope: SCOPE,
      state: EMPTY_STATE,
      tags: [{ id: "t1", name: "VIP" }],
    })

    expect(state.tags.get("t1")).toEqual({
      tagId: "tag-manual",
      origin: "manual",
    })
  })

  test("an already mapped tag is not resolved again", async () => {
    mocks.upsertByNames.mockResolvedValue([{ id: "tag-2", name: "Lead" }])
    mocks.insertAutoAndRead.mockImplementation(async (input: { rows: Row[] }) =>
      input.rows.map((row) => ({ ...row, origin: "auto" })),
    )
    const state = {
      ...EMPTY_STATE,
      tags: new Map([["t1", { tagId: "tag-1", origin: "manual" as const }]]),
    }

    const next = await resolveUnmappedTags({ scope: SCOPE, state, tags })

    expect(mocks.upsertByNames).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      names: ["Lead"],
    })
    expect(next.tags.get("t1")).toEqual({ tagId: "tag-1", origin: "manual" })
  })

  test("resolves nothing when every tag is mapped", async () => {
    const state = {
      ...EMPTY_STATE,
      tags: new Map([
        ["t1", { tagId: "tag-1", origin: "auto" as const }],
        ["t2", { tagId: "tag-2", origin: "auto" as const }],
      ]),
    }

    const next = await resolveUnmappedTags({ scope: SCOPE, state, tags })

    expect(next).toBe(state)
    expect(mocks.upsertByNames).not.toHaveBeenCalled()
    expect(mocks.insertAutoAndRead).not.toHaveBeenCalled()
  })

  test("the mapping state reads only the ids the source schema lists now", async () => {
    mocks.listForExternalIds.mockResolvedValue([])
    const { loadContactSyncMappingState } = await import("../mapping")

    await loadContactSyncMappingState(SCOPE, {
      tags,
      fields: [{ id: "f1", name: "City", type: "text" }],
    })

    expect(mocks.listForExternalIds).toHaveBeenCalledWith({
      ...SCOPE,
      tagIds: tags.map((tag) => tag.id),
      fieldIds: ["f1"],
    })
  })

  test("a mapping whose tag was deleted is resolved again", async () => {
    // The mapping row points at a soft-deleted tag: the live-tag query is empty.
    mocks.listForExternalIds.mockResolvedValue([
      mappingRow({ kind: "tag", externalId: "t1", tagId: "tag-gone" }),
    ])
    mocks.tagRows.mockResolvedValue([])
    const { loadContactSyncMappingState } = await import("../mapping")
    const state = await loadContactSyncMappingState(SCOPE, { tags, fields: [] })
    mocks.upsertByNames.mockResolvedValue([{ id: "tag-new", name: "VIP" }])
    mocks.insertAutoAndRead.mockImplementation(async (input: { rows: Row[] }) =>
      input.rows.map((row) => ({ ...row, origin: "auto" })),
    )

    const next = await resolveUnmappedTags({
      scope: SCOPE,
      state,
      tags: [{ id: "t1", name: "VIP" }],
    })

    expect(state.tags.has("t1")).toBe(false)
    expect(mocks.deleteStaleTagMappings).toHaveBeenCalledWith({
      ...SCOPE,
      stale: [{ externalId: "t1", tagId: "tag-gone" }],
    })
    expect(next.tags.get("t1")?.tagId).toBe("tag-new")
  })
})

describe("resolveUnmappedFields", () => {
  const fields = [
    { id: "f1", name: "City", type: "text" as const },
    { id: "f2", name: "Age", type: "number" as const },
    { id: "f3", name: "Meta", type: "json" as const },
  ]

  test("resolves unmapped fields with the default type and copy rename style", async () => {
    mocks.resolveByNameAndType.mockResolvedValue({
      idMap: new Map([
        ["shortText:city", "cf-1"],
        ["number:age", "cf-2"],
        ["longText:meta", "cf-3"],
      ]),
    })
    mocks.insertAutoAndRead.mockImplementation(async (input: { rows: Row[] }) =>
      input.rows.map((row) => ({ ...row, origin: "auto" })),
    )
    mocks.fieldRows.mockResolvedValue([
      { id: "cf-1", type: "shortText" },
      { id: "cf-2", type: "number" },
      { id: "cf-3", type: "longText" },
    ])

    const state = await resolveUnmappedFields({
      scope: SCOPE,
      state: EMPTY_STATE,
      fields,
    })

    expect(mocks.resolveByNameAndType).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      fields: [
        { name: "City", type: "shortText" },
        { name: "Age", type: "number" },
        { name: "Meta", type: "longText" },
      ],
      renameStyle: "copy",
    })
    expect(state.fields.get("f1")).toEqual({
      customFieldId: "cf-1",
      type: "shortText",
      origin: "auto",
    })
    expect(state.fields.get("f3")).toEqual({
      customFieldId: "cf-3",
      type: "longText",
      origin: "auto",
    })
  })

  test("a manual mapping read back is kept as stored", async () => {
    mocks.resolveByNameAndType.mockResolvedValue({
      idMap: new Map([["shortText:city", "cf-auto"]]),
    })
    mocks.insertAutoAndRead.mockResolvedValue([
      {
        kind: "customField",
        externalId: "f1",
        customFieldId: "cf-manual",
        tagId: null,
        origin: "manual",
      },
    ])
    mocks.fieldRows.mockResolvedValue([{ id: "cf-manual", type: "longText" }])

    const state = await resolveUnmappedFields({
      scope: SCOPE,
      state: EMPTY_STATE,
      fields: [fields[0] as (typeof fields)[number]],
    })

    expect(state.fields.get("f1")).toEqual({
      customFieldId: "cf-manual",
      type: "longText",
      origin: "manual",
    })
  })

  test("an already mapped field is not resolved again", async () => {
    mocks.resolveByNameAndType.mockResolvedValue({
      idMap: new Map([["number:age", "cf-2"]]),
    })
    mocks.insertAutoAndRead.mockImplementation(async (input: { rows: Row[] }) =>
      input.rows.map((row) => ({ ...row, origin: "auto" })),
    )
    mocks.fieldRows.mockResolvedValue([{ id: "cf-2", type: "number" }])
    const state = {
      ...EMPTY_STATE,
      fields: new Map([
        [
          "f1",
          {
            customFieldId: "cf-1",
            type: "shortText" as const,
            origin: "manual" as const,
          },
        ],
        [
          "f3",
          {
            customFieldId: "cf-3",
            type: "longText" as const,
            origin: "auto" as const,
          },
        ],
      ]),
    }

    const next = await resolveUnmappedFields({ scope: SCOPE, state, fields })

    expect(mocks.resolveByNameAndType).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      fields: [{ name: "Age", type: "number" }],
      renameStyle: "copy",
    })
    expect(next.fields.get("f1")?.customFieldId).toBe("cf-1")
    expect(next.fields.get("f2")?.customFieldId).toBe("cf-2")
  })

  test("resolves nothing when every field is mapped", async () => {
    const state = {
      ...EMPTY_STATE,
      fields: new Map(
        fields.map((field) => [
          field.id,
          {
            customFieldId: `cf-${field.id}`,
            type: "shortText" as const,
            origin: "auto" as const,
          },
        ]),
      ),
    }

    const next = await resolveUnmappedFields({ scope: SCOPE, state, fields })

    expect(next).toBe(state)
    expect(mocks.resolveByNameAndType).not.toHaveBeenCalled()
  })

  test("a mapping whose custom field was deleted is resolved again", async () => {
    // The field's mapping row is gone from the live state (cascade delete).
    mocks.listForExternalIds.mockResolvedValue([
      mappingRow({
        kind: "customField",
        externalId: "f1",
        customFieldId: "cf-gone",
      }),
    ])
    mocks.fieldRows.mockResolvedValue([])
    const { loadContactSyncMappingState } = await import("../mapping")
    const state = await loadContactSyncMappingState(SCOPE, { tags: [], fields })
    mocks.resolveByNameAndType.mockResolvedValue({
      idMap: new Map([["shortText:city", "cf-new"]]),
    })
    mocks.insertAutoAndRead.mockImplementation(async (input: { rows: Row[] }) =>
      input.rows.map((row) => ({ ...row, origin: "auto" })),
    )
    mocks.fieldRows.mockResolvedValue([{ id: "cf-new", type: "shortText" }])

    const next = await resolveUnmappedFields({
      scope: SCOPE,
      state,
      fields: [fields[0] as (typeof fields)[number]],
    })

    expect(state.fields.has("f1")).toBe(false)
    expect(mocks.resolveByNameAndType).toHaveBeenCalledTimes(1)
    expect(next.fields.get("f1")?.customFieldId).toBe("cf-new")
  })

  test("never creates a field for a reserved name", async () => {
    const next = await resolveUnmappedFields({
      scope: SCOPE,
      state: EMPTY_STATE,
      fields: [{ id: "f9", name: "bot_field:secret", type: "text" }],
    })

    expect(next).toBe(EMPTY_STATE)
    expect(mocks.resolveByNameAndType).not.toHaveBeenCalled()
  })
})
