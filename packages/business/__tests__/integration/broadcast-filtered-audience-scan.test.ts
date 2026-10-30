// @vitest-environment node

import { and, asc, db, eq, inArray } from "@chatbotx.io/database/client"
import {
  buildContactInboxContactFilterSQL,
  contactInboxHasDmSQL,
} from "@chatbotx.io/database/queries"
import {
  contactInboxModel,
  contactModel,
  conversationModel,
  inboxModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"

/** The shared Vitest preset uses a non-routable port so DB suites self-skip. */
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

const databaseUrl = realDatabaseUrl()

vi.mock("../../src/broadcast/plan-policy.service", () => ({
  broadcastPlanPolicyService: {},
}))

const { broadcastService } = await import("../../src/broadcast/service")

const ownerId = createId()
const workspaceId = createId()
const inboxId = createId()
const CONTACT_COUNT = 24
const contactFilter = {
  operator: "and" as const,
  conditions: [
    { field: "fullName" as const, operator: "contains" as const, value: "Ada" },
  ],
}

/**
 * The pre-§7.2 query: the whole filter as a subquery, windowed by SQL
 * OFFSET/LIMIT, plus the default direct-chat requirement of a broadcast.
 */
const legacyAudienceIds = async (
  offset: number,
  size: number | null,
): Promise<string[]> => {
  const query = db
    .select({ id: contactInboxModel.id })
    .from(contactInboxModel)
    .where(
      and(
        inArray(contactInboxModel.inboxId, [inboxId]),
        contactInboxHasDmSQL(),
        buildContactInboxContactFilterSQL({
          contactIdColumn: contactInboxModel.contactId,
          workspaceId,
          contactFilter,
        }),
      ),
    )
    .orderBy(asc(contactInboxModel.id))
    .offset(offset)
  const rows = await (size == null ? query : query.limit(size))
  return rows.map((row) => row.id)
}

const scannedAudienceIds = async (
  offset: number,
  size: number | null,
  chunkSize: number,
): Promise<string[]> => {
  const ids: string[] = []
  await broadcastService.forEachAudienceChunk(
    {
      workspaceId,
      channels: ["telegram"],
      inboxIds: [inboxId],
      contactFilter,
      chunkSize,
      audienceRange: { offset, size },
    },
    (rows) => {
      ids.push(...rows.map((row) => row.id))
      return Promise.resolve(undefined)
    },
  )
  return ids
}

describe.skipIf(!databaseUrl)("filtered broadcast audience scan", () => {
  beforeAll(async () => {
    await db.insert(userModel).values({
      id: ownerId,
      email: `audience-scan-${ownerId}@example.test`,
      name: "Audience scan owner",
    })
    await db
      .insert(workspaceModel)
      .values({ id: workspaceId, name: `scan-${workspaceId}`, ownerId })
    await db.insert(inboxModel).values({
      id: inboxId,
      workspaceId,
      name: "Scan inbox",
      channel: "telegram",
      sourceId: `scan-${inboxId}`,
    })
    for (let index = 0; index < CONTACT_COUNT; index += 1) {
      const contactId = createId()
      await db.insert(contactModel).values({
        id: contactId,
        workspaceId,
        // Every third contact is outside the filter.
        firstName: index % 3 === 0 ? "Bob" : "Ada",
        lastName: `L${index}`,
      })
      await db.insert(contactInboxModel).values({
        contactId,
        originalContactId: contactId,
        inboxId,
        channel: "telegram",
        source: "telegram",
        sourceId: `scan-${contactId}`,
      })
      // Every fourth contact has no direct chat yet, so a broadcast leaves
      // it out by default.
      if (index % 4 !== 0) {
        await db
          .insert(conversationModel)
          .values({ workspaceId, contactId, sourceId: null })
      }
    }
  })

  afterAll(async () => {
    await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
    await db.delete(userModel).where(eq(userModel.id, ownerId))
  })

  test.each([
    { offset: 0, size: null, chunkSize: 5 },
    { offset: 0, size: 4, chunkSize: 3 },
    { offset: 3, size: 6, chunkSize: 4 },
    { offset: 5, size: null, chunkSize: 100 },
    { offset: 15, size: 10, chunkSize: 2 },
    { offset: 100, size: 5, chunkSize: 5 },
  ])("matches the legacy filter+OFFSET/LIMIT walk for offset $offset size $size (chunk $chunkSize)", async ({
    offset,
    size,
    chunkSize,
  }) => {
    const legacy = await legacyAudienceIds(offset, size)
    const scanned = await scannedAudienceIds(offset, size, chunkSize)

    expect(scanned).toEqual(legacy)
  })

  test("walks the whole filtered audience in ContactInbox.id order", async () => {
    const all = await legacyAudienceIds(0, null)

    // 16 contacts match the filter; 4 of them have no direct chat.
    expect(all).toHaveLength(12)
    expect(await scannedAudienceIds(0, null, 7)).toEqual(all)
  })
})
