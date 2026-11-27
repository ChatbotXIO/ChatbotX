import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ContactSyncRecord } from "../types"

const mocks = vi.hoisted(() => ({
  resolveLinks: vi.fn(),
  mergeProfiles: vi.fn(),
  linkTags: vi.fn(),
  bulkUpsertValues: vi.fn(),
  incrementBy: vi.fn(),
  usageIncrement: vi.fn(),
  invalidate: vi.fn(),
  resolveUnmappedTags: vi.fn(),
  resolveUnmappedFields: vi.fn(),
}))

vi.mock("../../coexist-import/service", () => ({
  coexistImportService: { resolveOrCreateContactLinks: mocks.resolveLinks },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  contactRepository: {
    mergeProfiles: mocks.mergeProfiles,
    linkTags: mocks.linkTags,
  },
  contactCustomFieldRepository: { bulkUpsertValues: mocks.bulkUpsertValues },
}))
vi.mock("../../quota-enforcement/service", () => ({
  quotaEnforcementService: { incrementBy: mocks.incrementBy },
}))
vi.mock("../../workspace-usage/service", () => ({
  workspaceUsageService: { increment: mocks.usageIncrement },
}))
vi.mock("../../contact/service", () => ({
  contactService: { invalidate: mocks.invalidate },
}))
vi.mock("../mapping", () => ({
  resolveUnmappedTags: mocks.resolveUnmappedTags,
  resolveUnmappedFields: mocks.resolveUnmappedFields,
}))
// Anything that emits must never be reached by a silent import: loading any
// of these modules from the import path fails the whole file.
const { forbidden } = vi.hoisted(() => ({
  forbidden: (what: string) => () => {
    throw new Error(`contact sync must not import ${what}`)
  },
}))
vi.mock("@chatbotx.io/event-bus", forbidden("the event bus"))
vi.mock("@chatbotx.io/events", forbidden("events"))
vi.mock("../../trigger/service", forbidden("triggers"))
vi.mock("../../tag/service", forbidden("the emitting tag service"))
vi.mock("../../tag/sync.service", forbidden("tag sync"))
vi.mock("../../ads-conversion/service", forbidden("ads conversion"))
vi.mock("../../webhook", forbidden("webhooks"))
vi.mock("../../webhook/service", forbidden("webhooks"))
vi.mock(
  "../../contact-custom-field/service",
  forbidden("the emitting custom-field service"),
)

const { importContactSyncPage } = await import("../import-page")

const record = (patch: Partial<ContactSyncRecord> = {}): ContactSyncRecord => ({
  externalId: "1",
  channelUserId: "psid-1",
  scopedUserId: null,
  firstName: "An",
  lastName: null,
  fullName: null,
  gender: null,
  locale: null,
  timezoneOffsetHours: null,
  avatarUrl: null,
  phone: null,
  email: null,
  ref: null,
  country: null,
  state: null,
  city: null,
  location: null,
  tags: [],
  fieldValues: [],
  ...patch,
})

const context = {
  workspaceId: "ws-1",
  ownerId: "owner-1",
  targetCountry: "VN",
  workspaceTimezone: "Asia/Ho_Chi_Minh",
}

const state = {
  tags: new Map([["t-1", { tagId: "tag-9", origin: "auto" as const }]]),
  fields: new Map([
    [
      "f-num",
      {
        customFieldId: "cf-num",
        type: "number" as const,
        origin: "auto" as const,
      },
    ],
    [
      "f-mismatch",
      {
        customFieldId: "cf-text",
        type: "shortText" as const,
        origin: "manual" as const,
      },
    ],
  ]),
}

const schema = {
  tags: [{ id: "t-1", name: "VIP" }],
  fields: [
    { id: "f-num", name: "score", type: "number" as const },
    { id: "f-mismatch", name: "visits", type: "number" as const },
  ],
}

const options = {
  syncTags: true,
  syncCustomFields: true,
  overwriteExisting: false,
}

const link = (contactId: string) => ({
  contactInboxId: `ci-${contactId}`,
  contactId,
})

const run = (
  records: ContactSyncRecord[],
  patch: Partial<typeof options> = {},
) =>
  importContactSyncPage({
    context,
    page: { provider: "ahachat", channel: "messenger", pageId: "p1" },
    inbox: { id: "inbox-1", channel: "messenger" },
    records,
    schema,
    state,
    options: { ...options, ...patch },
  })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.resolveUnmappedTags.mockImplementation(async (input) => input.state)
  mocks.resolveUnmappedFields.mockImplementation(async (input) => input.state)
  mocks.mergeProfiles.mockResolvedValue([])
  mocks.linkTags.mockResolvedValue(0)
  mocks.bulkUpsertValues.mockResolvedValue({ dropped: 0 })
  mocks.usageIncrement.mockResolvedValue(undefined)
})

describe("importContactSyncPage", () => {
  test("creates contacts silently, as imported, without a profile snapshot", async () => {
    mocks.resolveLinks.mockResolvedValue({
      importedContacts: 1,
      contactInboxIds: new Map([["psid-1", link("c-new")]]),
      newContactCreatedEvents: [{ contactId: "c-new" }],
    })

    const result = await run([record()])

    expect(mocks.resolveLinks).toHaveBeenCalledWith(
      expect.objectContaining({
        captureProfileSnapshot: false,
        source: "imported",
        inboxId: "inbox-1",
        inboxChannel: "messenger",
        sourceIds: ["psid-1"],
      }),
    )
    const dedup = mocks.resolveLinks.mock.calls[0]?.[0].dedup
    expect(dedup.get("psid-1")).toEqual({
      sourceId: "psid-1",
      profile: { firstName: "An" },
    })
    expect(mocks.mergeProfiles).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      mode: "fill",
      rows: [],
    })
    expect(mocks.incrementBy).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "contacts",
      count: 1,
    })
    expect(mocks.usageIncrement).toHaveBeenCalledWith("ws-1", "contacts", 1)
    expect(mocks.invalidate).not.toHaveBeenCalled()
    expect(result.counters).toEqual({
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
      skippedValues: 0,
    })
  })

  test("merges existing contacts in the chosen mode and invalidates them", async () => {
    mocks.resolveLinks.mockResolvedValue({
      importedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("c-old")]]),
      newContactCreatedEvents: [],
    })

    const result = await run([record()], { overwriteExisting: true })

    expect(mocks.mergeProfiles).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      mode: "overwrite",
      rows: [{ contactId: "c-old", patch: { firstName: "An" } }],
    })
    expect(mocks.incrementBy).not.toHaveBeenCalled()
    expect(mocks.invalidate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["c-old"],
    })
    expect(result.counters.updated).toBe(1)
  })

  test("attaches mapped tags and writes only type-compatible field values", async () => {
    mocks.resolveLinks.mockResolvedValue({
      importedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("c-old")]]),
      newContactCreatedEvents: [],
    })

    const result = await run([
      record({
        tags: [{ id: "t-1", name: "VIP" }],
        fieldValues: [
          { id: "f-num", value: "2.50" },
          { id: "f-mismatch", value: "7" },
          { id: "f-unknown", value: "x" },
        ],
      }),
    ])

    expect(mocks.linkTags).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      pairs: [{ contactId: "c-old", tagId: "tag-9" }],
    })
    expect(mocks.bulkUpsertValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      mode: "fill",
      entries: [{ contactId: "c-old", customFieldId: "cf-num", value: "2.5" }],
    })
    // The incompatible mapping drops its value and counts it; a field that
    // has no mapping at all is not counted.
    expect(result.counters.skippedValues).toBe(1)
  })

  test("a tag the source schema does not list is neither created nor attached", async () => {
    mocks.resolveLinks.mockResolvedValue({
      importedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("c-old")]]),
      newContactCreatedEvents: [],
    })

    await run([
      record({
        tags: [
          { id: "t-1", name: "VIP" },
          { id: "t-unlisted", name: "Not in schema" },
        ],
      }),
    ])

    // Only schema tags reach resolution, so a page is bounded by the schema.
    expect(mocks.resolveUnmappedTags).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [{ id: "t-1", name: "VIP" }] }),
    )
    expect(mocks.linkTags).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      pairs: [{ contactId: "c-old", tagId: "tag-9" }],
    })
  })

  test("a value the target type rejects is dropped and counted, never coerced", async () => {
    mocks.resolveLinks.mockResolvedValue({
      importedContacts: 0,
      contactInboxIds: new Map([
        ["psid-1", link("c-1")],
        ["psid-2", link("c-2")],
      ]),
      newContactCreatedEvents: [],
    })

    const result = await run([
      record({ fieldValues: [{ id: "f-num", value: "not a number" }] }),
      record({
        channelUserId: "psid-2",
        fieldValues: [{ id: "f-num", value: "4" }],
      }),
    ])

    expect(mocks.bulkUpsertValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      mode: "fill",
      entries: [{ contactId: "c-2", customFieldId: "cf-num", value: "4" }],
    })
    expect(result.counters).toMatchObject({ updated: 2, skippedValues: 1 })
  })

  test("values of a field deleted while the page imports are dropped and counted", async () => {
    mocks.resolveLinks.mockResolvedValue({
      importedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("c-1")]]),
      newContactCreatedEvents: [],
    })
    mocks.bulkUpsertValues.mockResolvedValue({ dropped: 1 })

    const result = await run([
      record({ fieldValues: [{ id: "f-num", value: "4" }] }),
    ])

    expect(result.counters.skippedValues).toBe(1)
  })

  test("replaying the same page creates nothing twice and counts no quota again", async () => {
    mocks.resolveLinks
      .mockResolvedValueOnce({
        importedContacts: 1,
        contactInboxIds: new Map([["psid-1", link("c-1")]]),
        newContactCreatedEvents: [{ contactId: "c-1" }],
      })
      // The second call finds the contact the first one created.
      .mockResolvedValueOnce({
        importedContacts: 0,
        contactInboxIds: new Map([["psid-1", link("c-1")]]),
        newContactCreatedEvents: [],
      })
    const page = [
      record({
        tags: [{ id: "t-1", name: "VIP" }],
        fieldValues: [{ id: "f-num", value: "4" }],
      }),
    ]

    const first = await run(page)
    const second = await run(page)

    expect(first.counters).toMatchObject({ created: 1, updated: 0 })
    expect(second.counters).toMatchObject({ created: 0, updated: 1 })
    expect(mocks.incrementBy).toHaveBeenCalledTimes(1)
    expect(mocks.usageIncrement).toHaveBeenCalledTimes(1)
    // Both runs write the same converging upserts (unique pairs, DO NOTHING).
    expect(mocks.linkTags.mock.calls[0]).toEqual(mocks.linkTags.mock.calls[1])
    expect(mocks.bulkUpsertValues.mock.calls[0]).toEqual(
      mocks.bulkUpsertValues.mock.calls[1],
    )
  })

  test("values are not counted when the run does not sync custom fields", async () => {
    mocks.resolveLinks.mockResolvedValue({
      importedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("c-1")]]),
      newContactCreatedEvents: [],
    })

    const result = await run(
      [record({ fieldValues: [{ id: "f-mismatch", value: "7" }] })],
      { syncCustomFields: false },
    )

    expect(result.counters.skippedValues).toBe(0)
  })

  test("skips tags and fields when the run does not sync them", async () => {
    mocks.resolveLinks.mockResolvedValue({
      importedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("c-old")]]),
      newContactCreatedEvents: [],
    })

    await run([record({ tags: [{ id: "t-1", name: "VIP" }] })], {
      syncTags: false,
      syncCustomFields: false,
    })

    expect(mocks.linkTags).not.toHaveBeenCalled()
    expect(mocks.bulkUpsertValues).not.toHaveBeenCalled()
    expect(mocks.resolveUnmappedTags).not.toHaveBeenCalled()
  })

  test("records without an identity and duplicates in the page are skipped", async () => {
    mocks.resolveLinks.mockResolvedValue({
      importedContacts: 1,
      contactInboxIds: new Map([["psid-1", link("c-new")]]),
      newContactCreatedEvents: [{ contactId: "c-new" }],
    })

    const result = await run([
      record({ channelUserId: null }),
      record({ firstName: "First" }),
      record({ firstName: "Last" }),
    ])

    const dedup = mocks.resolveLinks.mock.calls[0]?.[0].dedup
    expect(dedup.get("psid-1").profile).toEqual({ firstName: "Last" })
    expect(result.counters.skipped).toBe(2)
  })

  test("a page with nothing importable never touches the database", async () => {
    const result = await run([record({ channelUserId: null })])

    expect(mocks.resolveLinks).not.toHaveBeenCalled()
    expect(result.counters).toEqual({
      created: 0,
      updated: 0,
      skipped: 1,
      failed: 0,
      skippedValues: 0,
    })
  })

  test("a record that could not be linked counts as failed", async () => {
    mocks.resolveLinks.mockResolvedValue({
      importedContacts: 0,
      contactInboxIds: new Map(),
      newContactCreatedEvents: [],
    })

    const result = await run([record()])

    expect(result.counters.failed).toBe(1)
  })

  test("a usage-counter outage does not fail the page", async () => {
    mocks.resolveLinks.mockResolvedValue({
      importedContacts: 1,
      contactInboxIds: new Map([["psid-1", link("c-new")]]),
      newContactCreatedEvents: [{ contactId: "c-new" }],
    })
    mocks.usageIncrement.mockRejectedValue(new Error("redis down"))

    await expect(run([record()])).resolves.toMatchObject({
      counters: { created: 1 },
    })
  })
})
