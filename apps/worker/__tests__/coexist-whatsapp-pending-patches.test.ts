import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Post-batch patches Meta delivers BEFORE the message they target used to be
 * dropped while the staging row that carried them was still marked processed —
 * the media was lost for good. They are now carried on the run and replayed.
 * See brief-coexist-history-lifecycle.md §D.
 */
const {
  mockBulkCreateAttachments,
  mockBulkPatchContentAttributes,
  mockFindByInboxAndSourceIds,
  mockFindManyBySourceIds,
} = vi.hoisted(() => ({
  mockBulkCreateAttachments: vi.fn(),
  mockBulkPatchContentAttributes: vi.fn(),
  mockFindByInboxAndSourceIds: vi.fn(),
  mockFindManyBySourceIds: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxRepository: {
    findByInboxAndSourceIds: mockFindByInboxAndSourceIds,
  },
  createMessageRepository: () =>
    Promise.resolve({
      bulkCreateAttachments: mockBulkCreateAttachments,
      bulkPatchContentAttributes: mockBulkPatchContentAttributes,
      findManyBySourceIds: mockFindManyBySourceIds,
    }),
  getSafeSinceTime: (time: Date | null | undefined) =>
    time ? new Date(time) : undefined,
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: () => "attachment-1" }
})

import {
  applyPostBatchPatches,
  capPendingPatches,
  PENDING_PATCH_CAP,
  pendingPatchesToBatch,
  pendingPatchKey,
} from "../src/integration/handlers/coexist/whatsapp-flush-patches"

const CONTACT_WA_ID = "601234567890"
const WAMID = "wamid.abc"

const attachment = {
  sourceId: "media-1",
  fileType: "image" as const,
  mimeType: "image/jpeg",
  originPath: "wa-media:media-1",
  size: 0,
  width: null,
  height: null,
  name: undefined,
}

/** contactInbox lookup returns one resolvable contact. */
const wireContactInbox = (rows: unknown[]) => {
  mockFindByInboxAndSourceIds.mockResolvedValue(rows)
}

const resolvedContactInbox = [
  {
    id: "ci-1",
    sourceId: CONTACT_WA_ID,
    lastIncomingMessageAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  },
]

describe("applyPostBatchPatches — pending patch carry-over", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindByInboxAndSourceIds.mockReset()
    mockBulkCreateAttachments.mockResolvedValue([{ id: "attachment-1" }])
    mockBulkPatchContentAttributes.mockResolvedValue(undefined)
  })

  it("flush 1: a media follow-up whose message is missing is returned as pending, not dropped", async () => {
    wireContactInbox(resolvedContactInbox)
    mockFindManyBySourceIds.mockResolvedValue([])

    const result = await applyPostBatchPatches({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      mediaFollowUps: [
        { sourceId: WAMID, contactWaId: CONTACT_WA_ID, attachment },
      ],
      edits: [],
      revokes: [],
    })

    expect(result.insertedAttachmentIds).toEqual([])
    expect(mockBulkCreateAttachments).not.toHaveBeenCalled()
    expect(result.unresolved).toHaveLength(1)
    expect(result.unresolved[0]).toMatchObject({
      kind: "media",
      contactWaId: CONTACT_WA_ID,
      sourceId: WAMID,
    })
  })

  it("flush 2: replaying the pending patch attaches the media once the history row exists", async () => {
    wireContactInbox(resolvedContactInbox)
    mockFindManyBySourceIds.mockResolvedValue([])
    const first = await applyPostBatchPatches({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      mediaFollowUps: [
        { sourceId: WAMID, contactWaId: CONTACT_WA_ID, attachment },
      ],
      edits: [],
      revokes: [],
    })

    // Next flush: bulkImportHistorical has since inserted the parent message.
    vi.clearAllMocks()
    mockFindByInboxAndSourceIds.mockReset()
    wireContactInbox(resolvedContactInbox)
    mockBulkCreateAttachments.mockResolvedValue([{ id: "attachment-1" }])
    mockFindManyBySourceIds.mockResolvedValue([
      {
        id: "msg-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        sourceId: WAMID,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ])

    const carried = pendingPatchesToBatch(first.unresolved)
    const second = await applyPostBatchPatches({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      ...carried,
      stagedAtByKey: new Map(
        first.unresolved.map((patch) => [
          pendingPatchKey(patch),
          patch.stagedAt,
        ]),
      ),
    })

    expect(second.unresolved).toEqual([])
    expect(second.insertedAttachmentIds).toEqual(["attachment-1"])
    expect(mockBulkCreateAttachments).toHaveBeenCalledWith([
      expect.objectContaining({
        messageId: "msg-1",
        conversationId: "conv-1",
        sourceId: "media-1",
        originPath: "wa-media:media-1",
      }),
    ])
  })

  it("keeps the original stagedAt when a patch is replayed", async () => {
    wireContactInbox(resolvedContactInbox)
    mockFindManyBySourceIds.mockResolvedValue([])
    const first = await applyPostBatchPatches({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      mediaFollowUps: [
        { sourceId: WAMID, contactWaId: CONTACT_WA_ID, attachment },
      ],
      edits: [],
      revokes: [],
    })
    const originalStagedAt = first.unresolved[0]?.stagedAt

    wireContactInbox(resolvedContactInbox)
    mockFindManyBySourceIds.mockResolvedValue([])
    const second = await applyPostBatchPatches({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      ...pendingPatchesToBatch(first.unresolved),
      stagedAtByKey: new Map(
        first.unresolved.map((patch) => [
          pendingPatchKey(patch),
          patch.stagedAt,
        ]),
      ),
    })

    expect(second.unresolved[0]?.stagedAt).toBe(originalStagedAt)
  })

  it("edits and revokes whose message is missing are pending too (not silently no-op'd)", async () => {
    wireContactInbox(resolvedContactInbox)
    mockFindManyBySourceIds.mockResolvedValue([])

    const result = await applyPostBatchPatches({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      mediaFollowUps: [],
      edits: [
        {
          sourceId: "orig-1",
          contactWaId: CONTACT_WA_ID,
          text: "edited",
          attachment: null,
        },
      ],
      revokes: [{ sourceId: "orig-2", contactWaId: CONTACT_WA_ID }],
    })

    expect(mockBulkPatchContentAttributes).not.toHaveBeenCalled()
    expect(result.unresolved.map((patch) => patch.kind).sort()).toEqual([
      "edit",
      "revoke",
    ])
  })

  it("a patch for a contact that does not exist at all is pending", async () => {
    wireContactInbox([])

    const result = await applyPostBatchPatches({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      mediaFollowUps: [
        { sourceId: WAMID, contactWaId: "unknown-wa-id", attachment },
      ],
      edits: [],
      revokes: [],
    })

    expect(result.unresolved).toHaveLength(1)
    expect(mockFindManyBySourceIds).not.toHaveBeenCalled()
  })

  // The single-write test in coexist-whatsapp-flush.test.ts counts `db.update`
  // calls the repository path never issues, so it proves nothing about bounded
  // round-trips. This does: K edits + K revokes that all RESOLVE must collapse
  // into exactly one bulkPatchContentAttributes call and one message lookup.
  it("K resolved edits + K revokes issue exactly one bulkPatchContentAttributes call", async () => {
    const K = 3
    const contactWaIds = Array.from({ length: K }, (_, i) => `6012345670${i}`)
    wireContactInbox(
      contactWaIds.map((waId, i) => ({
        id: `ci-${i}`,
        sourceId: waId,
        lastIncomingMessageAt: new Date("2026-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      })),
    )
    // Every edit and revoke resolves to a real message row.
    mockFindManyBySourceIds.mockResolvedValue(
      contactWaIds.flatMap((_waId, i) => [
        {
          id: `msg-edit-${i}`,
          conversationId: `conv-${i}`,
          contactInboxId: `ci-${i}`,
          sourceId: `orig-edit-${i}`,
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
        {
          id: `msg-revoke-${i}`,
          conversationId: `conv-${i}`,
          contactInboxId: `ci-${i}`,
          sourceId: `orig-revoke-${i}`,
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ]),
    )

    const result = await applyPostBatchPatches({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      mediaFollowUps: [],
      edits: contactWaIds.map((waId, i) => ({
        sourceId: `orig-edit-${i}`,
        contactWaId: waId,
        text: `edited-${i}`,
        attachment: null,
      })),
      revokes: contactWaIds.map((waId, i) => ({
        sourceId: `orig-revoke-${i}`,
        contactWaId: waId,
      })),
    })

    expect(result.unresolved).toEqual([])
    // ONE lookup and ONE patch write for all 2K patches — not 2K round-trips.
    expect(mockFindManyBySourceIds).toHaveBeenCalledTimes(1)
    expect(mockBulkPatchContentAttributes).toHaveBeenCalledTimes(1)
    const [patchArgs] = mockBulkPatchContentAttributes.mock.calls[0] as [
      { patches: { overlay: Record<string, unknown> }[] },
    ]
    expect(patchArgs.patches).toHaveLength(2 * K)
    expect(
      patchArgs.patches.filter((patch) => patch.overlay.edited === true),
    ).toHaveLength(K)
    expect(
      patchArgs.patches.filter((patch) => patch.overlay.revoked === true),
    ).toHaveLength(K)
    // No attachments in this scenario, so no attachment round-trip either.
    expect(mockBulkCreateAttachments).not.toHaveBeenCalled()
  })

  it("no patches at all is a no-op", async () => {
    const result = await applyPostBatchPatches({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      mediaFollowUps: [],
      edits: [],
      revokes: [],
    })

    expect(result).toEqual({ insertedAttachmentIds: [], unresolved: [] })
    expect(mockFindByInboxAndSourceIds).not.toHaveBeenCalled()
  })
})

describe("capPendingPatches", () => {
  const makePatch = (index: number) => ({
    kind: "revoke" as const,
    contactWaId: CONTACT_WA_ID,
    sourceId: `wamid-${index}`,
    stagedAt: new Date(2026, 0, 1, 0, 0, index).toISOString(),
  })

  it("keeps everything under the cap", () => {
    const entries = Array.from({ length: 10 }, (_, i) => makePatch(i))
    expect(capPendingPatches(entries)).toHaveLength(10)
  })

  it("drops the OLDEST entries beyond the cap", () => {
    const entries = Array.from({ length: PENDING_PATCH_CAP + 5 }, (_, i) =>
      makePatch(i),
    )

    const capped = capPendingPatches(entries)

    const sourceIds = capped.map((patch) => patch.sourceId)
    expect(capped).toHaveLength(PENDING_PATCH_CAP)
    // The five oldest (index 0-4) are the ones shed; the newest survives.
    expect(sourceIds).not.toContain("wamid-0")
    expect(sourceIds).not.toContain("wamid-4")
    expect(sourceIds).toContain("wamid-5")
    expect(capped.at(-1)?.sourceId).toBe(`wamid-${PENDING_PATCH_CAP + 4}`)
  })

  it("de-duplicates by patch identity", () => {
    const entries = [makePatch(1), makePatch(1), makePatch(2)]
    expect(capPendingPatches(entries)).toHaveLength(2)
  })

  it("keys a media follow-up and an edit for the same message separately", () => {
    const shared = { contactWaId: CONTACT_WA_ID, sourceId: WAMID }
    expect(pendingPatchKey({ kind: "media", ...shared })).not.toBe(
      pendingPatchKey({ kind: "edit", ...shared }),
    )
  })
})
