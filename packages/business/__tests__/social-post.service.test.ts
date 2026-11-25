import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteDraft: vi.fn(),
  deleteParts: vi.fn(),
  deletePostMedia: vi.fn(),
  deleteTargetMedia: vi.fn(),
  deleteTargetsExcept: vi.fn(),
  findByIdempotencyKey: vi.fn(),
  findDestinations: vi.fn(),
  findForWorkspace: vi.fn(),
  findTopicIds: vi.fn(),
  hydratePosts: vi.fn(),
  insertParts: vi.fn(),
  insertPost: vi.fn(),
  insertPostMedia: vi.fn(),
  insertTargetMedia: vi.fn(),
  insertTargets: vi.fn(),
  list: vi.fn(),
  listParts: vi.fn(),
  listPostMedia: vi.fn(),
  listTargetMedia: vi.fn(),
  listTargets: vi.fn(),
  listTopics: vi.fn(),
  lockForUpdate: vi.fn(),
  lockPostDestinations: vi.fn(),
  replaceTopics: vi.fn(),
  sessionCleanup: vi.fn(),
  sessionResolve: vi.fn(),
  specsOf: vi.fn(),
  updateEditable: vi.fn(),
  updateTarget: vi.fn(),
}))

const tx = { kind: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      await run(tx),
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  EDITABLE_POST_STATUSES: ["draft", "scheduled"],
  socialPostPartRepository: {
    deleteForTarget: mocks.deleteParts,
    insertMany: mocks.insertParts,
    listForTargets: mocks.listParts,
  },
  socialPostPublishRepository: {},
  socialPostSchedulingRepository: {
    listForSchedule: async () => [],
    lockPostDestinations: mocks.lockPostDestinations,
    setTargetSchedule: async () => true,
  },
  socialPostRepository: {
    deleteDraft: mocks.deleteDraft,
    deletePostMedia: mocks.deletePostMedia,
    deleteTargetMedia: mocks.deleteTargetMedia,
    deleteTargetsExcept: mocks.deleteTargetsExcept,
    findByIdempotencyKey: mocks.findByIdempotencyKey,
    findDestinations: mocks.findDestinations,
    findForWorkspace: mocks.findForWorkspace,
    findTopicIds: mocks.findTopicIds,
    insertPost: mocks.insertPost,
    insertPostMedia: mocks.insertPostMedia,
    insertTargetMedia: mocks.insertTargetMedia,
    insertTargets: mocks.insertTargets,
    list: mocks.list,
    listPostMedia: mocks.listPostMedia,
    listTargetMedia: mocks.listTargetMedia,
    listTargets: mocks.listTargets,
    listTopics: mocks.listTopics,
    lockForUpdate: mocks.lockForUpdate,
    replaceTopics: mocks.replaceTopics,
    updateEditable: mocks.updateEditable,
    updateTarget: mocks.updateTarget,
  },
}))
vi.mock("../src/social-post/hydrate", () => ({
  hydratePosts: mocks.hydratePosts,
}))
vi.mock("../src/social-post/media", () => ({
  MAX_SOCIAL_MEDIA_PER_POST: 20,
  MediaImportSession: class {
    cleanup = mocks.sessionCleanup
    resolve = mocks.sessionResolve
  },
  specsOf: mocks.specsOf,
  specsOfRows: (
    rows: {
      durationMs: number | null
      kind: string
      mimeType: string
      size: number
    }[],
  ) =>
    rows.map((row) => ({
      durationMs: row.durationMs,
      kind: row.kind,
      mimeType: row.mimeType,
      size: row.size,
    })),
}))
vi.mock("../src/channel-post/management.service", () => ({
  MAX_TOPICS_PER_POST: 20,
}))
vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))

const { socialPostService } = await import("../src/social-post/service")

const WORKSPACE = "ws-1"
const author = { createdById: null, createdVia: "api" as const }
const destination = (id: string, provider = "threads") => ({
  id,
  inboxId: `inbox-${id}`,
  provider,
  socialAccountId: null,
  state: "ready",
})
const dto = (id: string) => ({ id, targets: [] })

describe("socialPostService", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.findDestinations.mockResolvedValue([destination("d1")])
    mocks.findTopicIds.mockResolvedValue([])
    mocks.insertPost.mockResolvedValue({ id: "new" })
    mocks.sessionResolve.mockResolvedValue([])
    mocks.specsOf.mockResolvedValue([])
    mocks.findForWorkspace.mockResolvedValue({ id: "new", status: "draft" })
    mocks.hydratePosts.mockImplementation((_workspaceId, rows) =>
      Promise.resolve(rows.map((row: { id: string }) => dto(row.id))),
    )
    mocks.listPostMedia.mockResolvedValue([])
    mocks.listParts.mockResolvedValue([])
  })

  describe("create", () => {
    const input = {
      ...author,
      targets: [{ destinationId: "d1" }],
      text: "hi",
      workspaceId: WORKSPACE,
    }

    test("writes the post and every child in one transaction", async () => {
      await socialPostService.create(input)

      expect(mocks.insertPost).toHaveBeenCalledWith(
        expect.objectContaining({ text: "hi", workspaceId: WORKSPACE }),
        tx,
      )
      expect(mocks.insertTargets).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            contentType: "text",
            provider: "threads",
            publishDestinationId: "d1",
          }),
        ],
        tx,
      )
      expect(mocks.insertPostMedia).toHaveBeenCalledWith(
        expect.objectContaining({ rows: [] }),
        tx,
      )
      expect(mocks.replaceTopics).toHaveBeenCalledWith(
        expect.objectContaining({ postTopicIds: [] }),
        tx,
      )
    })

    test.each([
      ["no destination", { targets: [] }],
      [
        "the same destination twice",
        { targets: [{ destinationId: "d1" }, { destinationId: "d1" }] },
      ],
      [
        "more than 20 destinations",
        {
          targets: Array.from({ length: 21 }, (_, i) => ({
            destinationId: `d${i}`,
          })),
        },
      ],
      [
        "more than 20 topics",
        {
          targets: [{ destinationId: "d1" }],
          topicIds: Array.from({ length: 21 }, (_, i) => `t${i}`),
        },
      ],
    ])("rejects %s before touching the database", async (_name, overrides) => {
      await expect(
        socialPostService.create({ ...input, ...overrides }),
      ).rejects.toMatchObject({ code: "validation" })
      expect(mocks.insertPost).not.toHaveBeenCalled()
    })

    test("a destination of another workspace is not found", async () => {
      mocks.findDestinations.mockResolvedValue([])

      await expect(socialPostService.create(input)).rejects.toMatchObject({
        code: "validation",
      })
      expect(mocks.findDestinations).toHaveBeenCalledWith({
        ids: ["d1"],
        workspaceId: WORKSPACE,
      })
      expect(mocks.insertPost).not.toHaveBeenCalled()
    })

    test("a topic of another workspace is not found", async () => {
      mocks.findTopicIds.mockResolvedValue([])

      await expect(
        socialPostService.create({ ...input, topicIds: ["t1"] }),
      ).rejects.toMatchObject({ code: "validation" })
      expect(mocks.findTopicIds).toHaveBeenCalledWith({
        ids: ["t1"],
        workspaceId: WORKSPACE,
      })
    })

    test("a content type the network does not publish is refused even for a draft", async () => {
      await expect(
        socialPostService.create({
          ...input,
          targets: [{ contentType: "story", destinationId: "d1" }],
        }),
      ).rejects.toMatchObject({ code: "validation" })
    })

    test.each([
      [
        "an unknown destination",
        () => mocks.findDestinations.mockResolvedValue([]),
      ],
      ["an unknown topic", () => mocks.findTopicIds.mockResolvedValue([])],
    ])("%s is refused before any file is imported", async (_name, arrange) => {
      arrange()

      await expect(
        socialPostService.create({
          ...input,
          media: [{ url: "https://e.com/a.jpg" }],
          topicIds: ["t1"],
        }),
      ).rejects.toMatchObject({ code: "validation" })
      expect(mocks.sessionResolve).not.toHaveBeenCalled()
    })

    test("a content type the network does not publish is refused before any file is imported", async () => {
      await expect(
        socialPostService.create({
          ...input,
          media: [{ url: "https://e.com/a.jpg" }],
          targets: [{ contentType: "story", destinationId: "d1" }],
        }),
      ).rejects.toMatchObject({ code: "validation" })
      expect(mocks.sessionResolve).not.toHaveBeenCalled()
    })

    test("a failed import removes what the call already imported", async () => {
      mocks.sessionResolve.mockRejectedValue(new Error("download failed"))

      await expect(
        socialPostService.create({
          ...input,
          media: [{ url: "https://e.com/a.jpg" }],
        }),
      ).rejects.toThrow("download failed")
      expect(mocks.sessionCleanup).toHaveBeenCalledTimes(1)
      expect(mocks.insertPost).not.toHaveBeenCalled()
    })

    test("a rolled-back transaction removes the imported files", async () => {
      mocks.insertTargets.mockRejectedValue(new Error("constraint"))

      await expect(
        socialPostService.create({
          ...input,
          media: [{ url: "https://e.com/a.jpg" }],
        }),
      ).rejects.toThrow("constraint")
      expect(mocks.sessionCleanup).toHaveBeenCalledTimes(1)
    })

    test("a stored post keeps the imported files", async () => {
      await socialPostService.create({
        ...input,
        media: [{ url: "https://e.com/a.jpg" }],
      })

      expect(mocks.sessionCleanup).not.toHaveBeenCalled()
    })

    test("derives the content type from the files", async () => {
      const video = {
        durationMs: null,
        kind: "video",
        mimeType: "video/mp4",
        size: 1,
      }
      mocks.specsOf.mockResolvedValue([video])
      mocks.sessionResolve.mockResolvedValue([video])
      mocks.findDestinations.mockResolvedValue([destination("d1", "instagram")])

      await socialPostService.create({
        ...input,
        media: [{ url: "https://e.com/a.mp4" }],
      })

      expect(mocks.insertTargets).toHaveBeenCalledWith(
        [expect.objectContaining({ contentType: "reel" })],
        tx,
      )
    })

    test("a destination that overrides its files stores them with the target", async () => {
      const own = [
        {
          id: "m1",
          kind: "image",
          mimeType: "image/jpeg",
          size: 1,
          position: 0,
        },
      ]
      mocks.sessionResolve.mockResolvedValueOnce([]).mockResolvedValueOnce(own)

      await socialPostService.create({
        ...input,
        targets: [
          { destinationId: "d1", media: [{ mediaLibraryFileId: "f1" }] },
        ],
      })

      expect(mocks.insertTargets).toHaveBeenCalledWith(
        [expect.objectContaining({ overridesMedia: true })],
        tx,
      )
      expect(mocks.insertTargetMedia).toHaveBeenCalledWith(
        expect.objectContaining({ rows: own }),
        tx,
      )
    })

    describe("idempotency", () => {
      const keyed = { ...input, idempotencyKey: "key-1" }

      test("the same key with the same request returns the post already made", async () => {
        let storedHash = ""
        mocks.insertPost.mockImplementationOnce(
          (values: { idempotencyRequestHash: string }) => {
            storedHash = values.idempotencyRequestHash
            return Promise.resolve({ id: "first" })
          },
        )
        mocks.findForWorkspace.mockResolvedValue({ id: "first" })
        await socialPostService.create(keyed)
        mocks.findByIdempotencyKey.mockResolvedValue({
          id: "first",
          idempotencyRequestHash: storedHash,
        })
        mocks.insertPost.mockClear()

        const replayed = await socialPostService.create(keyed)

        expect(replayed.id).toBe("first")
        expect(mocks.insertPost).not.toHaveBeenCalled()
      })

      test("the same key with a different request is a 409", async () => {
        mocks.findByIdempotencyKey.mockResolvedValue({
          id: "first",
          idempotencyRequestHash: "another-hash",
        })

        await expect(socialPostService.create(keyed)).rejects.toMatchObject({
          code: "socialPostKeyConflict",
          httpStatusCode: 409,
        })
        expect(mocks.insertPost).not.toHaveBeenCalled()
      })

      test("two spellings of one request hash alike", async () => {
        const hashes: string[] = []
        mocks.insertPost.mockImplementation(
          (values: { idempotencyRequestHash: string }) => {
            hashes.push(values.idempotencyRequestHash)
            return Promise.resolve({ id: "x" })
          },
        )

        await socialPostService.create({ ...keyed, text: "  hi  " })
        await socialPostService.create({ ...keyed, text: "hi", topicIds: [] })

        expect(hashes[0]).toBe(hashes[1])
      })

      test("spelled-out defaults hash like omitted ones, a real difference does not", async () => {
        const hashes: string[] = []
        mocks.insertPost.mockImplementation(
          (values: { idempotencyRequestHash: string }) => {
            hashes.push(values.idempotencyRequestHash)
            return Promise.resolve({ id: "x" })
          },
        )
        const withMedia = (
          media: { altText?: string; url: string }[],
          target: object = {},
        ) => ({
          ...keyed,
          media,
          targets: [{ destinationId: "d1", ...target }],
        })

        await socialPostService.create(
          withMedia([{ url: "https://e.com/a.jpg" }]),
        )
        await socialPostService.create({
          ...keyed,
          media: [
            {
              altText: undefined,
              mediaLibraryFileId: undefined,
              url: "https://e.com/a.jpg",
            },
          ],
          targets: [
            { contentType: undefined, destinationId: "d1", text: undefined },
          ],
        })
        await socialPostService.create(
          withMedia([{ url: "https://e.com/a.jpg" }], { text: "  " }),
        )
        await socialPostService.create(
          withMedia([{ url: "https://e.com/a.jpg" }], { text: "" }),
        )
        await socialPostService.create(
          withMedia([{ altText: "x", url: "https://e.com/a.jpg" }]),
        )

        expect(hashes[0]).toBe(hashes[1])
        // An explicit empty override (publish nothing) differs from inheriting.
        expect(hashes[2]).not.toBe(hashes[0])
        expect(hashes[2]).toBe(hashes[3])
        expect(hashes[4]).not.toBe(hashes[0])
      })

      test("losing a concurrent create returns the winner's post when the request is the same", async () => {
        let storedHash = ""
        mocks.insertPost.mockImplementationOnce(
          (values: { idempotencyRequestHash: string }) => {
            storedHash = values.idempotencyRequestHash
            return Promise.resolve(null)
          },
        )
        mocks.findByIdempotencyKey
          .mockResolvedValueOnce(null)
          .mockImplementationOnce(() =>
            Promise.resolve({
              id: "winner",
              idempotencyRequestHash: storedHash,
            }),
          )
        mocks.findForWorkspace.mockResolvedValue({ id: "winner" })

        const result = await socialPostService.create(keyed)

        expect(result.id).toBe("winner")
        expect(mocks.sessionCleanup).toHaveBeenCalledTimes(1)
        expect(mocks.insertTargets).not.toHaveBeenCalled()
      })

      test("losing a concurrent create to a different request is a 409", async () => {
        mocks.insertPost.mockResolvedValueOnce(null)
        mocks.findByIdempotencyKey
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: "winner",
            idempotencyRequestHash: "other",
          })

        await expect(socialPostService.create(keyed)).rejects.toMatchObject({
          code: "socialPostKeyConflict",
        })
      })

      test("a key over 200 characters is refused", async () => {
        await expect(
          socialPostService.create({
            ...input,
            idempotencyKey: "k".repeat(201),
          }),
        ).rejects.toMatchObject({ code: "validation" })
      })
    })
  })

  describe("get", () => {
    test("is scoped to the workspace and 404s on a foreign or missing post", async () => {
      mocks.findForWorkspace.mockResolvedValue(null)

      await expect(
        socialPostService.get({ id: "p1", workspaceId: WORKSPACE }),
      ).rejects.toMatchObject({ code: "notFound" })
      expect(mocks.findForWorkspace).toHaveBeenCalledWith({
        id: "p1",
        workspaceId: WORKSPACE,
      })
    })
  })

  describe("list", () => {
    test("clamps the page size and returns a cursor only when more rows follow", async () => {
      const row = (id: string) => ({
        createdAtText: `2026-01-0${id} 10:00:00.123456+00`,
        id,
      })
      mocks.list.mockResolvedValue([row("3"), row("2"), row("1")])

      const page = await socialPostService.list({
        filters: {},
        limit: 2,
        workspaceId: WORKSPACE,
      })

      expect(mocks.list).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 2, workspaceId: WORKSPACE }),
      )
      expect(page.items).toHaveLength(2)
      expect(page.nextCursor).toEqual({
        createdAt: "2026-01-02 10:00:00.123456+00",
        id: "2",
      })
    })

    test("no cursor on the last page", async () => {
      mocks.list.mockResolvedValue([{ createdAtText: "x", id: "1" }])

      expect(
        (await socialPostService.list({ filters: {}, workspaceId: WORKSPACE }))
          .nextCursor,
      ).toBeUndefined()
    })

    test("never asks for more than 100 rows", async () => {
      mocks.list.mockResolvedValue([])

      await socialPostService.list({
        filters: {},
        limit: 5000,
        workspaceId: WORKSPACE,
      })

      expect(mocks.list).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      )
    })
  })

  describe("update", () => {
    const editable = { id: "p1", linkUrl: null, status: "draft" }

    test("is refused once the post is past editing, before any file is imported", async () => {
      mocks.findForWorkspace.mockResolvedValue({
        ...editable,
        status: "published",
      })

      await expect(
        socialPostService.update({
          id: "p1",
          media: [{ url: "https://e.com/a.jpg" }],
          text: "x",
          workspaceId: WORKSPACE,
        }),
      ).rejects.toMatchObject({
        code: "socialPostNotEditable",
        httpStatusCode: 409,
      })
      expect(mocks.sessionResolve).not.toHaveBeenCalled()
    })

    test("a missing post is a 404, before any file is imported", async () => {
      mocks.findForWorkspace.mockResolvedValue(null)

      await expect(
        socialPostService.update({
          id: "p1",
          media: [{ url: "https://e.com/a.jpg" }],
          text: "x",
          workspaceId: WORKSPACE,
        }),
      ).rejects.toMatchObject({ code: "notFound" })
      expect(mocks.sessionResolve).not.toHaveBeenCalled()
    })

    test("a post that stops being editable after the first check removes the files this call imported", async () => {
      mocks.findForWorkspace.mockResolvedValue(editable)
      mocks.lockForUpdate.mockResolvedValue({
        ...editable,
        status: "published",
      })
      mocks.updateEditable.mockResolvedValue(false)

      await expect(
        socialPostService.update({
          id: "p1",
          media: [{ url: "https://e.com/a.jpg" }],
          workspaceId: WORKSPACE,
        }),
      ).rejects.toMatchObject({ code: "socialPostNotEditable" })
      expect(mocks.sessionCleanup).toHaveBeenCalledTimes(1)
    })

    test("a failure while resolving the files removes what was imported", async () => {
      mocks.findForWorkspace.mockResolvedValue(editable)
      mocks.sessionResolve.mockRejectedValue(new Error("download failed"))

      await expect(
        socialPostService.update({
          id: "p1",
          media: [{ url: "https://e.com/a.jpg" }],
          workspaceId: WORKSPACE,
        }),
      ).rejects.toThrow("download failed")
      expect(mocks.sessionCleanup).toHaveBeenCalledTimes(1)
    })

    test("a stored edit keeps the imported files", async () => {
      mocks.findForWorkspace.mockResolvedValue(editable)
      mocks.lockForUpdate.mockResolvedValue(editable)
      mocks.updateEditable.mockResolvedValue(true)

      await socialPostService.update({
        id: "p1",
        media: [{ url: "https://e.com/a.jpg" }],
        workspaceId: WORKSPACE,
      })

      expect(mocks.sessionCleanup).not.toHaveBeenCalled()
    })

    test("locks the post first, then edits fields, targets and topics together", async () => {
      const order: string[] = []
      mocks.lockForUpdate.mockImplementation(() => {
        order.push("lock")
        return Promise.resolve(editable)
      })
      mocks.updateEditable.mockImplementation(() => {
        order.push("edit")
        return Promise.resolve(true)
      })
      mocks.replaceTopics.mockImplementation(() => {
        order.push("topics")
        return Promise.resolve()
      })
      mocks.listTargets.mockResolvedValue([])
      mocks.findTopicIds.mockResolvedValue(["t1"])
      mocks.findForWorkspace.mockResolvedValue(editable)

      await socialPostService.update({
        id: "p1",
        targets: [{ destinationId: "d1" }],
        text: "new",
        topicIds: ["t1"],
        workspaceId: WORKSPACE,
      })

      expect(order).toEqual(["lock", "edit", "topics"])
      expect(mocks.deleteTargetsExcept).toHaveBeenCalledWith(
        {
          keepDestinationIds: ["d1"],
          socialPostId: "p1",
          workspaceId: WORKSPACE,
        },
        tx,
      )
    })

    test("a duplicate topic id is neither a false 'not found' nor extra rows", async () => {
      mocks.findForWorkspace.mockResolvedValue(editable)
      mocks.lockForUpdate.mockResolvedValue(editable)
      mocks.updateEditable.mockResolvedValue(true)
      mocks.findTopicIds.mockResolvedValue(["t1"])

      await socialPostService.update({
        id: "p1",
        topicIds: ["t1", "t1"],
        workspaceId: WORKSPACE,
      })

      expect(mocks.findTopicIds).toHaveBeenCalledWith({
        ids: ["t1"],
        workspaceId: WORKSPACE,
      })
      expect(mocks.replaceTopics).toHaveBeenCalledWith(
        { postTopicIds: ["t1"], socialPostId: "p1" },
        tx,
      )
    })

    test("more than 20 distinct topics are refused on update", async () => {
      await expect(
        socialPostService.update({
          id: "p1",
          topicIds: Array.from({ length: 21 }, (_, i) => `t${i}`),
          workspaceId: WORKSPACE,
        }),
      ).rejects.toMatchObject({ code: "validation" })
      expect(mocks.updateEditable).not.toHaveBeenCalled()
    })

    test("new targets without a linkUrl follow the stored post's link", async () => {
      const linked = { ...editable, linkUrl: "https://e.com/page" }
      mocks.findForWorkspace.mockResolvedValue(linked)
      mocks.lockForUpdate.mockResolvedValue(linked)
      mocks.updateEditable.mockResolvedValue(true)
      mocks.listTargets.mockResolvedValue([])
      mocks.findDestinations.mockResolvedValue([destination("d1", "facebook")])

      await socialPostService.update({
        id: "p1",
        targets: [{ destinationId: "d1" }],
        workspaceId: WORKSPACE,
      })

      expect(mocks.insertTargets).toHaveBeenCalledWith(
        [expect.objectContaining({ contentType: "link" })],
        tx,
      )
    })

    test("takes the destination queue locks, existing and added together, before any target row is locked or written", async () => {
      const order: string[] = []
      mocks.lockForUpdate.mockResolvedValue(editable)
      mocks.updateEditable.mockResolvedValue(true)
      mocks.lockPostDestinations.mockImplementation(() => {
        order.push("destinationLocks")
        return Promise.resolve()
      })
      mocks.deleteTargetsExcept.mockImplementation(() => {
        order.push("targetWrite")
        return Promise.resolve()
      })
      mocks.findDestinations.mockResolvedValue([destination("d2")])
      mocks.listTargets.mockResolvedValue([])
      mocks.findForWorkspace.mockResolvedValue(editable)

      await socialPostService.update({
        id: "p1",
        targets: [{ destinationId: "d2" }],
        workspaceId: WORKSPACE,
      })

      expect(mocks.lockPostDestinations).toHaveBeenCalledWith(
        {
          alsoDestinationIds: ["d2"],
          socialPostId: "p1",
          workspaceId: WORKSPACE,
        },
        tx,
      )
      expect(order).toEqual(["destinationLocks", "targetWrite"])
    })

    test("a kept destination is updated, a new one inserted", async () => {
      mocks.lockForUpdate.mockResolvedValue(editable)
      mocks.updateEditable.mockResolvedValue(true)
      mocks.findDestinations.mockResolvedValue([
        destination("d1"),
        destination("d2"),
      ])
      mocks.listTargets.mockResolvedValue([{ destinationId: "d1", id: "t1" }])
      mocks.findForWorkspace.mockResolvedValue(editable)

      await socialPostService.update({
        id: "p1",
        targets: [{ destinationId: "d1", text: "x" }, { destinationId: "d2" }],
        workspaceId: WORKSPACE,
      })

      expect(mocks.updateTarget).toHaveBeenCalledWith(
        expect.objectContaining({ id: "t1", workspaceId: WORKSPACE }),
        tx,
      )
      expect(mocks.insertTargets).toHaveBeenCalledWith(
        [expect.objectContaining({ publishDestinationId: "d2" })],
        tx,
      )
    })
  })

  describe("delete", () => {
    test("deletes a draft", async () => {
      mocks.deleteDraft.mockResolvedValue(true)

      await expect(
        socialPostService.delete({ id: "p1", workspaceId: WORKSPACE }),
      ).resolves.toBeUndefined()
      expect(mocks.deleteDraft).toHaveBeenCalledWith({
        id: "p1",
        workspaceId: WORKSPACE,
      })
    })

    test("a post that is not a draft is a 409", async () => {
      mocks.deleteDraft.mockResolvedValue(false)
      mocks.findForWorkspace.mockResolvedValue({ id: "p1" })

      await expect(
        socialPostService.delete({ id: "p1", workspaceId: WORKSPACE }),
      ).rejects.toMatchObject({
        code: "socialPostNotDeletable",
        httpStatusCode: 409,
      })
    })

    test("a missing or foreign post is a 404", async () => {
      mocks.deleteDraft.mockResolvedValue(false)
      mocks.findForWorkspace.mockResolvedValue(null)

      await expect(
        socialPostService.delete({ id: "p1", workspaceId: WORKSPACE }),
      ).rejects.toMatchObject({ code: "notFound" })
    })
  })

  describe("duplicate", () => {
    test("copies content, targets, files and topics into a new draft inside one transaction", async () => {
      mocks.findForWorkspace.mockResolvedValue({
        id: "src",
        linkUrl: null,
        text: "hello",
      })
      mocks.listTargets.mockResolvedValue([
        {
          contentType: "text",
          destinationId: "d1",
          id: "t1",
          options: {},
          overridesMedia: true,
          provider: "threads",
          textOverride: "own",
        },
      ])
      const media = {
        altText: null,
        durationMs: null,
        height: null,
        kind: "image",
        mediaLibraryFileId: "f1",
        mimeType: "image/jpeg",
        path: "p",
        position: 0,
        size: 1,
        width: null,
      }
      mocks.listPostMedia.mockResolvedValue([media])
      mocks.listTargetMedia.mockResolvedValue([
        { ...media, socialPostTargetId: "t1" },
      ])
      mocks.listTopics.mockResolvedValue([{ id: "topic-1" }])

      await socialPostService.duplicate({
        ...author,
        id: "src",
        workspaceId: WORKSPACE,
      })

      expect(mocks.insertPost).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: null,
          text: "hello",
          workspaceId: WORKSPACE,
        }),
        tx,
      )
      expect(mocks.insertTargets).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            scheduleMode: "custom",
            publishDestinationId: "d1",
            textOverride: "own",
          }),
        ],
        tx,
      )
      expect(mocks.insertPostMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          rows: [
            expect.objectContaining({ path: "p", mediaLibraryFileId: "f1" }),
          ],
        }),
        tx,
      )
      expect(mocks.insertTargetMedia).toHaveBeenCalledTimes(1)
      expect(mocks.replaceTopics).toHaveBeenCalledWith(
        expect.objectContaining({ postTopicIds: ["topic-1"] }),
        tx,
      )
    })

    test("a missing source is a 404 and writes nothing", async () => {
      mocks.findForWorkspace.mockResolvedValue(null)

      await expect(
        socialPostService.duplicate({
          ...author,
          id: "src",
          workspaceId: WORKSPACE,
        }),
      ).rejects.toMatchObject({ code: "notFound" })
      expect(mocks.insertPost).not.toHaveBeenCalled()
    })
  })

  describe("validate and preview", () => {
    test("reports every network's issues in one response with the target index", async () => {
      mocks.findDestinations.mockResolvedValue([
        destination("d1", "threads"),
        destination("d2", "instagram"),
      ])

      const result = await socialPostService.validate({
        content: {
          targets: [{ destinationId: "d1" }, { destinationId: "d2" }],
          text: "a".repeat(501),
        },
        workspaceId: WORKSPACE,
      })

      expect(result.valid).toBe(false)
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "textTooLong",
            destinationId: "d1",
            targetIndex: 0,
          }),
          expect.objectContaining({
            code: "contentTypeNotSupported",
            destinationId: "d2",
            targetIndex: 1,
          }),
        ]),
      )
    })

    test("a destination that cannot publish is an issue, not an exception", async () => {
      mocks.findDestinations.mockResolvedValue([
        { ...destination("d1"), state: "needsReconnect" },
        { ...destination("d2"), state: "permissionMissing" },
        { ...destination("d3"), state: "inboxDisconnected" },
      ])

      const result = await socialPostService.validate({
        content: {
          targets: [
            { destinationId: "d1" },
            { destinationId: "d2" },
            { destinationId: "d3" },
            { destinationId: "missing" },
          ],
          text: "hi",
        },
        workspaceId: WORKSPACE,
      })

      expect(result.issues.map((issue) => issue.code).sort()).toEqual(
        [
          "inboxDisconnected",
          "inboxNeedsReconnect",
          "publishPermissionMissing",
          "destinationNotFound",
        ].sort(),
      )
    })

    test("a valid post has no issues", async () => {
      const result = await socialPostService.validate({
        content: { targets: [{ destinationId: "d1" }], text: "hello" },
        workspaceId: WORKSPACE,
      })

      expect(result).toEqual({ issues: [], valid: true })
    })

    test("the preview shows the effective text, its length and the network limit", async () => {
      const items = await socialPostService.preview({
        content: {
          targets: [{ destinationId: "d1", text: "own text" }],
          text: "shared",
        },
        workspaceId: WORKSPACE,
      })

      expect(items).toEqual([
        expect.objectContaining({
          charactersUsed: 8,
          contentType: "text",
          maxCharacters: 500,
          provider: "threads",
          text: "own text",
        }),
      ])
    })

    test("is scoped to the workspace", async () => {
      await socialPostService.validate({
        content: { targets: [{ destinationId: "d1" }], text: "hi" },
        workspaceId: WORKSPACE,
      })

      expect(mocks.findDestinations).toHaveBeenCalledWith({
        ids: ["d1"],
        workspaceId: WORKSPACE,
      })
    })
  })

  describe("parts and first comment", () => {
    const withParts = {
      ...author,
      targets: [
        {
          destinationId: "d1",
          firstComment: { text: "link in comments" },
          parts: [{ text: "two" }, { text: "three" }],
        },
      ],
      text: "one",
      workspaceId: WORKSPACE,
    }

    test("create stores the follow-ups in order: thread parts first, the first comment last", async () => {
      await socialPostService.create(withParts)

      const rows = mocks.insertParts.mock.calls[0]?.[0]
      expect(rows).toEqual([
        expect.objectContaining({
          kind: "threadPart",
          position: 1,
          text: "two",
        }),
        expect.objectContaining({
          kind: "threadPart",
          position: 2,
          text: "three",
        }),
        expect.objectContaining({
          kind: "firstComment",
          position: 3,
          text: "link in comments",
        }),
      ])
      const targetId = mocks.insertTargets.mock.calls[0]?.[0][0].id
      expect(
        rows.every(
          (row: { socialPostTargetId: string }) =>
            row.socialPostTargetId === targetId,
        ),
      ).toBe(true)
    })

    test("a post without parts stores none and hashes as it did before parts existed", async () => {
      const key = { idempotencyKey: "k-1" }
      await socialPostService.create({
        ...key,
        ...author,
        targets: [{ destinationId: "d1" }],
        text: "hi",
        workspaceId: WORKSPACE,
      })
      await socialPostService.create({
        ...key,
        ...author,
        targets: [{ destinationId: "d1", firstComment: null, parts: [] }],
        text: "hi",
        workspaceId: WORKSPACE,
      })

      expect(
        mocks.insertParts.mock.calls.every((call) => call[0].length === 0),
      ).toBe(true)
      const hashes = mocks.insertPost.mock.calls.map(
        (call) => call[0].idempotencyRequestHash,
      )
      expect(hashes[0]).toBe(hashes[1])
    })

    test("a request with parts hashes apart from one without", async () => {
      const key = { idempotencyKey: "k-2" }
      await socialPostService.create({
        ...key,
        ...author,
        targets: [{ destinationId: "d1" }],
        text: "one",
        workspaceId: WORKSPACE,
      })
      await socialPostService.create({ ...key, ...withParts })

      const hashes = mocks.insertPost.mock.calls.map(
        (call) => call[0].idempotencyRequestHash,
      )
      expect(hashes[0]).not.toBe(hashes[1])
    })

    test("more than ten follow-ups are refused before anything is read", async () => {
      await expect(
        socialPostService.create({
          ...author,
          targets: [
            {
              destinationId: "d1",
              parts: Array.from({ length: 11 }, () => ({ text: "x" })),
            },
          ],
          workspaceId: WORKSPACE,
        }),
      ).rejects.toMatchObject({ field: "targets" })
      expect(mocks.insertPost).not.toHaveBeenCalled()
    })

    test("update replaces the parts of a kept destination as a whole", async () => {
      mocks.lockForUpdate.mockResolvedValue({ linkUrl: null })
      mocks.listTargets.mockResolvedValue([
        { destinationId: "d1", id: "t-old" },
      ])
      mocks.updateEditable.mockResolvedValue({ id: "new" })

      await socialPostService.update({
        id: "new",
        targets: withParts.targets,
        workspaceId: WORKSPACE,
      })

      expect(mocks.deleteParts).toHaveBeenCalledWith(
        { socialPostTargetId: "t-old", workspaceId: WORKSPACE },
        tx,
      )
      expect(mocks.insertParts.mock.calls.at(-1)?.[0]).toHaveLength(3)
    })

    test("validate names the part field: a network with no thread, too many, too long, empty", async () => {
      mocks.findDestinations.mockResolvedValue([
        destination("d1", "threads"),
        destination("d2", "facebook"),
      ])
      const long = "x".repeat(501)
      const { issues } = await socialPostService.validate({
        content: {
          targets: [
            {
              destinationId: "d1",
              parts: [{ text: long }, { text: "  " }],
            },
            { destinationId: "d2", parts: [{ text: "a" }] },
          ],
          text: "hi",
        },
        workspaceId: WORKSPACE,
      })

      expect(issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "partTextTooLong",
            field: "parts[0].text",
            partIndex: 0,
            targetIndex: 0,
          }),
          expect.objectContaining({
            code: "partTextRequired",
            field: "parts[1].text",
            partIndex: 1,
          }),
          expect.objectContaining({
            code: "partsNotSupported",
            field: "parts",
            targetIndex: 1,
          }),
        ]),
      )
    })

    test("duplicate copies the parts as text, positions kept, every copy pending", async () => {
      mocks.findForWorkspace.mockResolvedValue({
        id: "src",
        linkUrl: null,
        text: "hello",
      })
      mocks.listTargets.mockResolvedValue([
        {
          contentType: "text",
          destinationId: "d1",
          id: "t1",
          options: {},
          overridesMedia: false,
          provider: "threads",
          textOverride: null,
        },
      ])
      mocks.listTargetMedia.mockResolvedValue([])
      mocks.listTopics.mockResolvedValue([])
      mocks.listParts.mockResolvedValue([
        {
          id: "old-1",
          kind: "threadPart",
          position: 1,
          socialPostTargetId: "t1",
          status: "published",
          text: "two",
        },
        {
          id: "old-2",
          kind: "firstComment",
          position: 2,
          socialPostTargetId: "t1",
          status: "failed",
          text: "c",
        },
      ])

      await socialPostService.duplicate({
        ...author,
        id: "src",
        workspaceId: WORKSPACE,
      })

      const copies = mocks.insertParts.mock.calls[0]?.[0]
      const newTargetId = mocks.insertTargets.mock.calls[0]?.[0][0].id
      expect(copies).toEqual([
        expect.objectContaining({
          kind: "threadPart",
          position: 1,
          socialPostTargetId: newTargetId,
          text: "two",
        }),
        expect.objectContaining({
          kind: "firstComment",
          position: 2,
          socialPostTargetId: newTargetId,
          text: "c",
        }),
      ])
      expect(copies.map((copy: { id: string }) => copy.id)).not.toContain(
        "old-1",
      )
      expect(copies[0]).not.toHaveProperty("status")
    })
  })

  test("content types come from the registry", () => {
    const rules = socialPostService.contentTypes()
    expect(rules.map((entry) => entry.provider)).toEqual([
      "facebook",
      "instagram",
      "threads",
      "tiktok",
    ])
    expect(
      rules
        .find((entry) => entry.provider === "tiktok")
        ?.contentTypes.map((rule) => rule.contentType),
    ).toEqual(["video"])
  })
})
