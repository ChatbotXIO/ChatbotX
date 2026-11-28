// @vitest-environment node

/**
 * `tagService.replaceContactTagsByNames` against concurrent tag changes on a
 * real Postgres. A competing writer commits while the replace is paused inside
 * its transaction (right after the point where the old code took a stale read
 * of the links). What it reports (tagApplied / tagRemoved / sync / ads /
 * realtime) must be exactly what its own INSERT and DELETE really changed.
 *
 * Commits for real, so each test deletes its workspace and owner afterwards.
 */

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import {
  contactModel,
  contactsToTagsModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { barrier, heldBy, within } from "../helpers/template-concurrency"

vi.hoisted(() => {
  process.env.DATABASE_POOL_MAX ??= "2"
})

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

vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: (_key: string, fn: () => Promise<unknown>) => fn(),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/events")>()),
  emitTagApplied: vi.fn().mockResolvedValue(undefined),
  emitTagRemoved: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../src/platform/realtime-broadcast", () => ({
  queueWorkspaceRealtimeEvent: vi.fn().mockResolvedValue(undefined),
}))

const { tagService } = await import("../../src/tag/service")
const { tagSyncService } = await import("../../src/tag/sync.service")
const { adsConversionService } = await import(
  "../../src/ads-conversion/service"
)
const { contactService } = await import("../../src/contact")
const { emitTagApplied, emitTagRemoved } = await import("@chatbotx.io/events")
const { invalidateCacheByTags } = await import("@chatbotx.io/redis")
const { queueWorkspaceRealtimeEvent } = await import(
  "../../src/platform/realtime-broadcast"
)

const databaseUrl = realDatabaseUrl()

describe.skipIf(!databaseUrl)("replaceContactTagsByNames, concurrently", () => {
  const created: { workspaceId: string; userId: string }[] = []
  const pending: Promise<unknown>[] = []

  let enqueueAttach = vi.spyOn(tagSyncService, "enqueueAttach")
  let enqueueDetach = vi.spyOn(tagSyncService, "enqueueDetach")
  let adsBulk = vi.spyOn(
    adsConversionService,
    "enqueueTagAppliedEvaluationsBulk",
  )
  let contactInvalidate = vi.spyOn(contactService, "invalidate")

  beforeEach(() => {
    vi.mocked(emitTagApplied).mockClear()
    vi.mocked(emitTagRemoved).mockClear()
    vi.mocked(invalidateCacheByTags).mockClear()
    vi.mocked(queueWorkspaceRealtimeEvent).mockClear()
    enqueueAttach = vi
      .spyOn(tagSyncService, "enqueueAttach")
      .mockResolvedValue(undefined)
    enqueueDetach = vi
      .spyOn(tagSyncService, "enqueueDetach")
      .mockResolvedValue(undefined)
    adsBulk = vi
      .spyOn(adsConversionService, "enqueueTagAppliedEvaluationsBulk")
      .mockResolvedValue(undefined)
    contactInvalidate = vi
      .spyOn(contactService, "invalidate")
      .mockResolvedValue(undefined)
  })

  afterEach(async () => {
    // Nothing may still touch the rows when the workspace goes away.
    await Promise.allSettled(pending.splice(0))
    vi.restoreAllMocks()
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const track = <T>(promise: Promise<T>): Promise<T> => {
    pending.push(promise)
    return promise
  }

  /** A workspace with one contact and the named tags (none linked yet). */
  const seed = async (tagNames: string[]) => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `tag-replace-race-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `tag-replace-race-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    created.push({ workspaceId: workspace.id, userId: owner.id })
    const [contact] = await db
      .insert(contactModel)
      .values({ workspaceId: workspace.id })
      .returning({ id: contactModel.id })
    const names = tagNames.map((name) => `${name}-${suffix}`)
    const tags = await tagService.upsertByNames({
      workspaceId: workspace.id,
      names,
    })
    const idOf = (name: string): string => {
      const found = tags.find((tag) => tag.name === `${name}-${suffix}`)
      if (!found) {
        throw new Error(`tag ${name} was not created`)
      }
      return found.id
    }
    return {
      workspaceId: workspace.id,
      contactId: contact.id,
      idOf,
      nameOf: (name: string) => `${name}-${suffix}`,
    }
  }

  const link = async (contactId: string, tagIds: string[]) => {
    await db
      .insert(contactsToTagsModel)
      .values(tagIds.map((tagId) => ({ contactId, tagId })))
  }

  const unlink = async (contactId: string, tagIds: string[]) => {
    await db
      .delete(contactsToTagsModel)
      .where(
        and(
          eq(contactsToTagsModel.contactId, contactId),
          inArray(contactsToTagsModel.tagId, tagIds),
        ),
      )
  }

  const linkedTagIds = async (contactId: string): Promise<string[]> => {
    const rows = await db
      .select({ tagId: contactsToTagsModel.tagId })
      .from(contactsToTagsModel)
      .where(eq(contactsToTagsModel.contactId, contactId))
    return rows.map((row) => row.tagId).sort()
  }

  /** Pauses the next replace inside its transaction, after the stale read of the old code. */
  const pauseInsideTransaction = () => {
    const entered = barrier()
    const resume = barrier()
    const realUpsert = tagService.upsertByNames.bind(tagService)
    vi.spyOn(tagService, "upsertByNames").mockImplementationOnce(
      async (input) => {
        entered.open()
        await within(resume.promise)
        return await realUpsert(input)
      },
    )
    return { entered, resume }
  }

  const argTagIds = (mock: { mock: { calls: unknown[][] } }): string[] =>
    mock.mock.calls.map((call) => String(call[2])).sort()

  const syncTagIds = (mock: { mock: { calls: unknown[][] } }): string[] =>
    mock.mock.calls
      .map((call) => {
        const [arg] = call as [{ tagId: string }]
        return arg.tagId
      })
      .sort()

  test("reports the removal of a tag a competitor added while the replace ran", async () => {
    const { workspaceId, contactId, idOf, nameOf } = await seed(["a", "b", "c"])
    await link(contactId, [idOf("a")])
    const { entered, resume } = pauseInsideTransaction()

    const replace = track(
      tagService.replaceContactTagsByNames({
        workspaceId,
        contactId,
        names: [nameOf("b")],
      }),
    )
    await within(heldBy(entered.promise, replace))
    await link(contactId, [idOf("c")])
    resume.open()
    await within(replace)

    expect(await linkedTagIds(contactId)).toEqual([idOf("b")])
    expect(argTagIds(vi.mocked(emitTagRemoved))).toEqual(
      [idOf("a"), idOf("c")].sort(),
    )
    expect(syncTagIds(enqueueDetach)).toEqual([idOf("a"), idOf("c")].sort())
    expect(argTagIds(vi.mocked(emitTagApplied))).toEqual([idOf("b")])
    expect(vi.mocked(queueWorkspaceRealtimeEvent)).toHaveBeenCalledTimes(1)
  })

  test("still deletes and reports a tag added concurrently when the old set looked empty", async () => {
    const { workspaceId, contactId, idOf } = await seed(["c"])
    const { entered, resume } = pauseInsideTransaction()

    const replace = track(
      tagService.replaceContactTagsByNames({
        workspaceId,
        contactId,
        names: [],
      }),
    )
    await within(heldBy(entered.promise, replace))
    await link(contactId, [idOf("c")])
    resume.open()
    await within(replace)

    expect(await linkedTagIds(contactId)).toEqual([])
    expect(argTagIds(vi.mocked(emitTagRemoved))).toEqual([idOf("c")])
    expect(syncTagIds(enqueueDetach)).toEqual([idOf("c")])
    expect(vi.mocked(queueWorkspaceRealtimeEvent)).toHaveBeenCalledTimes(1)
  })

  test("applies a tag once when two replaces both see it absent", async () => {
    const { workspaceId, contactId, idOf, nameOf } = await seed(["b"])
    const { entered, resume } = pauseInsideTransaction()

    const first = track(
      tagService.replaceContactTagsByNames({
        workspaceId,
        contactId,
        names: [nameOf("b")],
      }),
    )
    await within(heldBy(entered.promise, first))
    await within(
      tagService.replaceContactTagsByNames({
        workspaceId,
        contactId,
        names: [nameOf("b")],
      }),
    )
    resume.open()
    await within(first)

    expect(await linkedTagIds(contactId)).toEqual([idOf("b")])
    expect(argTagIds(vi.mocked(emitTagApplied))).toEqual([idOf("b")])
    expect(syncTagIds(enqueueAttach)).toEqual([idOf("b")])
    expect(adsBulk).toHaveBeenCalledTimes(1)
    expect(adsBulk).toHaveBeenCalledWith({
      workspaceId,
      pairs: [{ contactId, tagId: idOf("b") }],
    })
  })

  test("reports a wanted tag as applied when a competitor removed it before the insert", async () => {
    const { workspaceId, contactId, idOf, nameOf } = await seed(["a"])
    await link(contactId, [idOf("a")])
    const { entered, resume } = pauseInsideTransaction()

    const replace = track(
      tagService.replaceContactTagsByNames({
        workspaceId,
        contactId,
        names: [nameOf("a")],
      }),
    )
    await within(heldBy(entered.promise, replace))
    await unlink(contactId, [idOf("a")])
    resume.open()
    await within(replace)

    expect(await linkedTagIds(contactId)).toEqual([idOf("a")])
    expect(argTagIds(vi.mocked(emitTagApplied))).toEqual([idOf("a")])
    expect(syncTagIds(enqueueAttach)).toEqual([idOf("a")])
    expect(vi.mocked(emitTagRemoved)).not.toHaveBeenCalled()
  })

  test("a replace that changes nothing reports nothing but still invalidates the caches", async () => {
    const { workspaceId, contactId, idOf, nameOf } = await seed(["a"])
    await link(contactId, [idOf("a")])

    const result = await tagService.replaceContactTagsByNames({
      workspaceId,
      contactId,
      names: [nameOf("a")],
    })

    expect(result.map((tag) => tag.id)).toEqual([idOf("a")])
    expect(vi.mocked(emitTagApplied)).not.toHaveBeenCalled()
    expect(vi.mocked(emitTagRemoved)).not.toHaveBeenCalled()
    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(adsBulk).not.toHaveBeenCalled()
    expect(vi.mocked(queueWorkspaceRealtimeEvent)).not.toHaveBeenCalled()
    expect(vi.mocked(invalidateCacheByTags)).toHaveBeenCalledWith([
      "tags",
      `tags:${workspaceId}`,
    ])
    expect(contactInvalidate).toHaveBeenCalledWith({
      workspaceId,
      ids: [contactId],
    })
  })

  test("an empty list clears every link and reports each removal", async () => {
    const { workspaceId, contactId, idOf } = await seed(["a", "b"])
    await link(contactId, [idOf("a"), idOf("b")])

    const result = await tagService.replaceContactTagsByNames({
      workspaceId,
      contactId,
      names: [],
    })

    expect(result).toEqual([])
    expect(await linkedTagIds(contactId)).toEqual([])
    expect(argTagIds(vi.mocked(emitTagRemoved))).toEqual(
      [idOf("a"), idOf("b")].sort(),
    )
    expect(syncTagIds(enqueueDetach)).toEqual([idOf("a"), idOf("b")].sort())
  })

  test("returns the full resolved tags, kept and new alike", async () => {
    const { workspaceId, contactId, idOf, nameOf } = await seed(["a", "b"])
    await link(contactId, [idOf("a")])

    const result = await tagService.replaceContactTagsByNames({
      workspaceId,
      contactId,
      names: [nameOf("a"), nameOf("b")],
    })

    expect(result.map((tag) => tag.id).sort()).toEqual(
      [idOf("a"), idOf("b")].sort(),
    )
    expect(argTagIds(vi.mocked(emitTagApplied))).toEqual([idOf("b")])
  })
})
