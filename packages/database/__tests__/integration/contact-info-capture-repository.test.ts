// @vitest-environment node

/**
 * Real-SQL checks for the contact-info capture repository and the broadcast
 * attribution lock: idempotent inserts, one row per info type, workspace
 * scoping, grouped counts, keyset listing, bounded drains, and the
 * `FOR SHARE` broadcast lock that conflicts with move-to-draft / soft delete
 * while two captures never block each other. Runs only against an explicitly
 * configured local database after the approved migrations have been applied.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest"
import { relations } from "../../src/relations"
import { broadcastRepository } from "../../src/repositories/broadcast/repository"
import {
  hardDeleteBroadcast,
  purgeBroadcastCaptures,
} from "../../src/repositories/broadcast-purge"
import { contactInfoCaptureRepository } from "../../src/repositories/contact-info-capture/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const T_EARLY = new Date("2026-01-01T00:00:00.000Z")
const T_MID = new Date("2026-01-02T00:00:00.000Z")
const T_LATE = new Date("2026-01-03T00:00:00.000Z")

type Fixture = {
  contactIds: string[]
  contactInboxIds: string[]
  conversationIds: string[]
  inboxId: string
  userId: string
  workspaceId: string
}

describe.skipIf(!databaseUrl)("contact info capture repository", () => {
  let client: Client
  let own: Fixture
  let other: Fixture

  const database = () => drizzle({ client, relations, schema })

  const createFixture = async (label: string): Promise<Fixture> => {
    const db = database()
    const suffix = `${label}-${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(schema.userModel)
      .values({ email: `info-capture-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace] = await db
      .insert(schema.workspaceModel)
      .values({ name: `info-capture-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    const [inbox] = await db
      .insert(schema.inboxModel)
      .values({
        name: "info-capture",
        channel: "webchat",
        sourceId: `info-capture-${suffix}`,
        workspaceId: workspace.id,
      })
      .returning({ id: schema.inboxModel.id })

    const contactIds: string[] = []
    const contactInboxIds: string[] = []
    const conversationIds: string[] = []
    for (let index = 0; index < 3; index++) {
      const [contact] = await db
        .insert(schema.contactModel)
        .values({ workspaceId: workspace.id })
        .returning({ id: schema.contactModel.id })
      const [contactInbox] = await db
        .insert(schema.contactInboxModel)
        .values({
          originalContactId: contact.id,
          contactId: contact.id,
          inboxId: inbox.id,
          channel: "webchat",
          source: "webchat",
          sourceId: `info-capture-${suffix}-${index}`,
        })
        .returning({ id: schema.contactInboxModel.id })
      const [conversation] = await db
        .insert(schema.conversationModel)
        .values({ workspaceId: workspace.id, contactId: contact.id })
        .returning({ id: schema.conversationModel.id })
      contactIds.push(contact.id)
      contactInboxIds.push(contactInbox.id)
      conversationIds.push(conversation.id)
    }

    return {
      contactIds,
      contactInboxIds,
      conversationIds,
      inboxId: inbox.id,
      userId: user.id,
      workspaceId: workspace.id,
    }
  }

  const cleanup = async (fixture: Fixture | undefined) => {
    if (!fixture) {
      return
    }
    const db = database()
    await client.query(
      'DELETE FROM "ContactInfoCapture" WHERE "workspaceId" = $1',
      [fixture.workspaceId],
    )
    await db
      .delete(schema.workspaceModel)
      .where(eq(schema.workspaceModel.id, fixture.workspaceId))
    await db
      .delete(schema.userModel)
      .where(eq(schema.userModel.id, fixture.userId))
  }

  const capture = (
    fixture: Fixture,
    index: number,
    overrides: Partial<
      Parameters<typeof contactInfoCaptureRepository.insert>[0]
    > = {},
  ) =>
    contactInfoCaptureRepository.insert(
      {
        capturedAt: T_EARLY,
        contactId: fixture.contactIds[index],
        contactInboxId: fixture.contactInboxIds[index],
        conversationId: fixture.conversationIds[index],
        inboxId: fixture.inboxId,
        infoTypes: ["phone"],
        sourceId: "900",
        sourceType: "broadcast",
        workspaceId: fixture.workspaceId,
        ...overrides,
      },
      database(),
    )

  const rows = async (workspaceId: string) =>
    (
      await client.query<{
        contactId: string
        createdAt: Date
        infoType: string
        sourceId: string
      }>(
        `SELECT "contactId", "infoType", "sourceId", "createdAt" FROM "ContactInfoCapture"
          WHERE "workspaceId" = $1 ORDER BY "contactId", "infoType"`,
        [workspaceId],
      )
    ).rows

  const createBroadcast = async (
    fixture: Fixture,
    overrides: Partial<typeof schema.broadcastModel.$inferInsert> = {},
  ): Promise<string> => {
    const [broadcast] = await database()
      .insert(schema.broadcastModel)
      .values({
        name: "info-capture",
        workspaceId: fixture.workspaceId,
        status: "sent",
        schedulesType: "now",
        schedulesAt: new Date(),
        subaction: "webchatMessage",
        channel: "webchat",
        ...overrides,
      })
      .returning({ id: schema.broadcastModel.id })
    return broadcast.id
  }

  const addRecipient = async (
    fixture: Fixture,
    broadcastId: string,
    index: number,
    state: { deliveredAt?: Date; failedAt?: Date } = {},
  ) => {
    await database()
      .insert(schema.contactsOnBroadcastsModel)
      .values({
        broadcastId,
        contactId: fixture.contactIds[index],
        contactInboxId: fixture.contactInboxIds[index],
        conversationId: fixture.conversationIds[index],
        ...state,
      })
  }

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
  })

  afterAll(async () => {
    await client?.end()
  })

  beforeEach(async () => {
    own = await createFixture("own")
    other = await createFixture("other")
  })

  afterEach(async () => {
    await cleanup(own)
    await cleanup(other)
  })

  describe("insert", () => {
    test("is idempotent and keeps the first capture time", async () => {
      expect(await capture(own, 0, { capturedAt: T_EARLY })).toBe(1)
      expect(await capture(own, 0, { capturedAt: T_LATE })).toBe(0)

      const stored = await rows(own.workspaceId)
      expect(stored).toHaveLength(1)
      expect(stored[0]?.createdAt).toEqual(T_EARLY)
    })

    test("writes one row per info type", async () => {
      expect(await capture(own, 0, { infoTypes: ["phone", "email"] })).toBe(2)
      expect(
        (await rows(own.workspaceId)).map((row) => row.infoType).sort(),
      ).toEqual(["email", "phone"])
    })

    test("a repeated info type in one call is one row", async () => {
      expect(await capture(own, 0, { infoTypes: ["phone", "phone"] })).toBe(1)
    })

    test("writes nothing for an empty type list", async () => {
      expect(await capture(own, 0, { infoTypes: [] })).toBe(0)
    })

    test("keeps sources apart", async () => {
      await capture(own, 0, { sourceId: "900" })
      await capture(own, 0, { sourceId: "901" })
      expect(await rows(own.workspaceId)).toHaveLength(2)
    })

    test("never attaches a foreign workspace's contact", async () => {
      await contactInfoCaptureRepository.insert(
        {
          capturedAt: T_EARLY,
          contactId: other.contactIds[0],
          contactInboxId: other.contactInboxIds[0],
          conversationId: other.conversationIds[0],
          inboxId: other.inboxId,
          infoTypes: ["phone"],
          sourceId: "900",
          sourceType: "broadcast",
          workspaceId: own.workspaceId,
        },
        database(),
      )

      expect(await rows(own.workspaceId)).toHaveLength(0)
      expect(await rows(other.workspaceId)).toHaveLength(0)
    })

    test("writes nothing for a deleted contact", async () => {
      await database()
        .delete(schema.contactModel)
        .where(eq(schema.contactModel.id, own.contactIds[0]))

      expect(await capture(own, 0)).toBe(0)
      expect(await rows(own.workspaceId)).toHaveLength(0)
    })
  })

  describe("countBySources", () => {
    test("groups by source and info type for many sources in one read", async () => {
      await capture(own, 0, { infoTypes: ["phone", "email"], sourceId: "900" })
      await capture(own, 1, { infoTypes: ["phone"], sourceId: "900" })
      await capture(own, 0, { infoTypes: ["email"], sourceId: "901" })
      await capture(other, 0, { sourceId: "900" })

      const counts = await contactInfoCaptureRepository.countBySources({
        sourceIds: ["900", "901", "902"],
        sourceType: "broadcast",
        workspaceId: own.workspaceId,
      })

      const sorted = [...counts].sort((a, b) =>
        `${a.sourceId}${a.infoType}`.localeCompare(
          `${b.sourceId}${b.infoType}`,
        ),
      )
      expect(sorted).toEqual([
        { count: 1, infoType: "email", sourceId: "900" },
        { count: 2, infoType: "phone", sourceId: "900" },
        { count: 1, infoType: "email", sourceId: "901" },
      ])
    })

    test("returns nothing for no source ids", async () => {
      expect(
        await contactInfoCaptureRepository.countBySources({
          sourceIds: [],
          sourceType: "broadcast",
          workspaceId: own.workspaceId,
        }),
      ).toEqual([])
    })
  })

  describe("listing", () => {
    const seedThree = async () => {
      await capture(own, 0, { capturedAt: T_EARLY })
      await capture(own, 1, { capturedAt: T_LATE })
      await capture(own, 2, { capturedAt: T_LATE })
    }

    test("orders by (createdAt, contactId) descending", async () => {
      await seedThree()

      const first = await contactInfoCaptureRepository.listContacts({
        infoType: "phone",
        limit: 2,
        offset: 0,
        sourceId: "900",
        sourceType: "broadcast",
        workspaceId: own.workspaceId,
      })
      // Two rows share T_LATE: the higher contact id comes first.
      expect(first.map((row) => row.contactId)).toEqual([
        own.contactIds[2],
        own.contactIds[1],
      ])
      expect(first[0]?.createdAt).toEqual(T_LATE)
    })

    test("captures of deleted contact inboxes neither empty the page nor inflate the total", async () => {
      await capture(own, 0, { capturedAt: T_EARLY })
      await capture(own, 1, { capturedAt: T_LATE })
      await capture(own, 2, { capturedAt: T_LATE })
      await client.query('DELETE FROM "ContactInbox" WHERE "id" = ANY($1)', [
        [own.contactInboxIds[1], own.contactInboxIds[2]],
      ])
      const source = {
        infoType: "phone",
        sourceId: "900",
        sourceType: "broadcast",
        workspaceId: own.workspaceId,
      } as const

      // The two newest captures point at deleted inboxes; page size 2 must
      // still return the one remaining contact, and the total must say 1.
      const page = await contactInfoCaptureRepository.listContacts({
        ...source,
        limit: 2,
        offset: 0,
      })
      expect(page.map((row) => row.contactId)).toEqual([own.contactIds[0]])
      expect(await contactInfoCaptureRepository.countContacts(source)).toBe(1)
    })

    test("pages newest first with ties by contact id, skipping deleted inboxes before paging, and the total matches the pages", async () => {
      await capture(own, 0, { capturedAt: T_LATE })
      await capture(own, 1, { capturedAt: T_LATE })
      await capture(own, 2, { capturedAt: T_MID })
      // A foreign workspace capturing under the same source id must not leak in.
      await capture(other, 0, { capturedAt: T_LATE })
      const source = {
        infoType: "phone",
        sourceId: "900",
        sourceType: "broadcast",
        workspaceId: own.workspaceId,
      } as const
      const ids = async (offset: number, limit = 1) =>
        (
          await contactInfoCaptureRepository.listContacts({
            ...source,
            limit,
            offset,
          })
        ).map((row) => row.contactId)
      const [c0, c1, c2] = own.contactIds
      const higherFirst = BigInt(c1) > BigInt(c0) ? [c1, c0] : [c0, c1]

      expect(await ids(0, 3)).toEqual([...higherFirst, c2])
      expect(await contactInfoCaptureRepository.countContacts(source)).toBe(3)

      // The newest tied row loses its inbox: it is skipped, not a hole in a page.
      await client.query('DELETE FROM "ContactInbox" WHERE "id" = $1', [
        own.contactInboxIds[own.contactIds.indexOf(higherFirst[0])],
      ])
      const pages = [...(await ids(0)), ...(await ids(1)), ...(await ids(2))]
      expect(pages).toEqual([higherFirst[1], c2])
      expect(await ids(2)).toEqual([])
      expect(await contactInfoCaptureRepository.countContacts(source)).toBe(
        pages.length,
      )
    })

    test("countContacts is scoped to the workspace, source and info type", async () => {
      await seedThree()
      await capture(own, 0, { infoTypes: ["email"] })
      await capture(other, 0)
      const source = {
        sourceId: "900",
        sourceType: "broadcast",
        workspaceId: own.workspaceId,
      } as const

      expect(
        await contactInfoCaptureRepository.countContacts({
          ...source,
          infoType: "phone",
        }),
      ).toBe(3)
      expect(
        await contactInfoCaptureRepository.countContacts({
          ...source,
          infoType: "email",
        }),
      ).toBe(1)
    })

    test("pages by offset for a page-number API", async () => {
      await seedThree()
      const source = {
        infoType: "phone",
        sourceId: "900",
        sourceType: "broadcast",
        workspaceId: own.workspaceId,
      } as const

      const second = await contactInfoCaptureRepository.listContacts({
        ...source,
        limit: 2,
        offset: 2,
      })
      expect(second.map((row) => row.contactId)).toEqual([own.contactIds[0]])
    })

    test("leaves excluded contacts out of the contact-id paging", async () => {
      await seedThree()

      const page = await contactInfoCaptureRepository.listContactIds({
        excludeContactIds: [own.contactIds[1]],
        infoType: "phone",
        limit: 10,
        sourceId: "900",
        sourceType: "broadcast",
        workspaceId: own.workspaceId,
      })
      expect(page).not.toContain(own.contactIds[1])
      expect(page).toHaveLength(2)
    })

    test("filters by info type", async () => {
      await capture(own, 0, { infoTypes: ["email"] })

      const phone = await contactInfoCaptureRepository.listContacts({
        infoType: "phone",
        limit: 10,
        offset: 0,
        sourceId: "900",
        sourceType: "broadcast",
        workspaceId: own.workspaceId,
      })
      expect(phone).toEqual([])
    })

    test("pages contact ids ascending for bulk tagging", async () => {
      await seedThree()
      const source = {
        infoType: "phone",
        sourceId: "900",
        sourceType: "broadcast",
        workspaceId: own.workspaceId,
      } as const
      const ascending = [...own.contactIds].sort((a, b) =>
        BigInt(a) < BigInt(b) ? -1 : 1,
      )

      const page = await contactInfoCaptureRepository.listContactIds({
        ...source,
        limit: 2,
      })
      expect(page).toEqual(ascending.slice(0, 2))

      const rest = await contactInfoCaptureRepository.listContactIds({
        ...source,
        afterContactId: page.at(-1),
        limit: 2,
      })
      expect(rest).toEqual(ascending.slice(2))
    })

    test("pages contact ids numerically, not as text, across id lengths", async () => {
      const ids = ["2", "9", "10", "95", "100", "1000"]
      await client.query(
        `INSERT INTO "ContactInfoCapture"
           ("workspaceId", "sourceType", "sourceId", "infoType", "contactId",
            "contactInboxId", "inboxId", "conversationId", "createdAt")
         SELECT $1::bigint, 'broadcast', 900, 'phone', id::bigint, 1, 1, 1, now()
         FROM unnest($2::text[]) AS id`,
        [own.workspaceId, ids],
      )
      const source = {
        infoType: "phone",
        sourceId: "900",
        sourceType: "broadcast",
        workspaceId: own.workspaceId,
      } as const

      const collected: string[] = []
      let afterContactId: string | undefined
      for (const _ of ids) {
        const page = await contactInfoCaptureRepository.listContactIds({
          ...source,
          afterContactId,
          limit: 2,
        })
        if (page.length === 0) {
          break
        }
        collected.push(...page)
        afterContactId = page.at(-1)
      }

      expect(collected).toEqual(ids)
    })
  })

  describe("delete and drain", () => {
    test("deleteByContactIds removes only the given contacts' rows in the workspace", async () => {
      await capture(own, 0, { infoTypes: ["phone", "email"] })
      await capture(own, 1)
      await capture(other, 0)

      const deleted = await contactInfoCaptureRepository.deleteByContactIds(
        { contactIds: [own.contactIds[0]], workspaceId: own.workspaceId },
        database(),
      )

      expect(deleted).toBe(2)
      expect((await rows(own.workspaceId)).map((row) => row.contactId)).toEqual(
        [own.contactIds[1]],
      )
      expect(await rows(other.workspaceId)).toHaveLength(1)
    })

    test("deleteByContactIds with no ids is a no-op", async () => {
      expect(
        await contactInfoCaptureRepository.deleteByContactIds(
          { contactIds: [], workspaceId: own.workspaceId },
          database(),
        ),
      ).toBe(0)
    })

    test("drains one source in bounded batches and leaves other sources", async () => {
      await capture(own, 0, { infoTypes: ["phone", "email"], sourceId: "900" })
      await capture(own, 1, { infoTypes: ["phone", "email"], sourceId: "900" })
      await capture(own, 0, { sourceId: "901" })
      const source = {
        sourceId: "900",
        sourceType: "broadcast",
        workspaceId: own.workspaceId,
      } as const

      expect(await contactInfoCaptureRepository.existsForSource(source)).toBe(
        true,
      )
      const sizes: number[] = []
      for (;;) {
        const deleted = await contactInfoCaptureRepository.deleteSourceBatch({
          ...source,
          limit: 3,
        })
        sizes.push(deleted)
        if (deleted < 3) {
          break
        }
      }

      expect(sizes).toEqual([3, 1])
      expect(await contactInfoCaptureRepository.existsForSource(source)).toBe(
        false,
      )
      expect(
        await contactInfoCaptureRepository.existsForSource({
          ...source,
          sourceId: "901",
        }),
      ).toBe(true)
    })
  })

  describe("lockRecipientForAttribution", () => {
    const lock = (
      fixture: Fixture,
      broadcastId: string,
      index: number,
      flowId?: string,
      tx = database(),
    ) =>
      broadcastRepository.lockRecipientForAttribution(
        {
          broadcastId,
          contactId: fixture.contactIds[index],
          flowId,
          workspaceId: fixture.workspaceId,
        },
        tx,
      )

    test("returns the recipient's delivery state", async () => {
      const broadcastId = await createBroadcast(own)
      await addRecipient(own, broadcastId, 0, { deliveredAt: T_MID })
      await addRecipient(own, broadcastId, 1)
      await addRecipient(own, broadcastId, 2, { failedAt: T_MID })

      expect(await lock(own, broadcastId, 0)).toEqual({
        deliveredAt: T_MID,
        failedAt: null,
      })
      expect(await lock(own, broadcastId, 1)).toEqual({
        deliveredAt: null,
        failedAt: null,
      })
      expect(await lock(own, broadcastId, 2)).toEqual({
        deliveredAt: null,
        failedAt: T_MID,
      })
    })

    test("is not attributable when the contact is not a recipient", async () => {
      const broadcastId = await createBroadcast(own)
      expect(await lock(own, broadcastId, 0)).toBeNull()
    })

    test("is not attributable for a draft, a soft-deleted or a foreign-workspace broadcast", async () => {
      const draft = await createBroadcast(own, { status: "draft" })
      const deleted = await createBroadcast(own, { deletedAt: new Date() })
      const foreign = await createBroadcast(other)
      for (const broadcastId of [draft, deleted]) {
        await addRecipient(own, broadcastId, 0, { deliveredAt: T_MID })
        expect(await lock(own, broadcastId, 0)).toBeNull()
      }
      await addRecipient(other, foreign, 0, { deliveredAt: T_MID })
      // The foreign broadcast is looked up under the wrong workspace.
      expect(
        await broadcastRepository.lockRecipientForAttribution(
          {
            broadcastId: foreign,
            contactId: other.contactIds[0],
            workspaceId: own.workspaceId,
          },
          database(),
        ),
      ).toBeNull()
    })

    test("with a flow id, only a broadcast that sends that flow (directly or per target) matches", async () => {
      const [flowA] = await database()
        .insert(schema.flowModel)
        .values({ name: "info-capture-a", workspaceId: own.workspaceId })
        .returning({ id: schema.flowModel.id })
      const [flowB] = await database()
        .insert(schema.flowModel)
        .values({ name: "info-capture-b", workspaceId: own.workspaceId })
        .returning({ id: schema.flowModel.id })
      const direct = await createBroadcast(own, { flowId: flowA.id })
      const viaTarget = await createBroadcast(own, { targetMode: "targets" })
      await database().insert(schema.broadcastTargetModel).values({
        broadcastId: viaTarget,
        flowId: flowB.id,
        inboxId: own.inboxId,
      })
      await addRecipient(own, direct, 0, { deliveredAt: T_MID })
      await addRecipient(own, viaTarget, 0, { deliveredAt: T_MID })

      expect(await lock(own, direct, 0, flowA.id)).not.toBeNull()
      expect(await lock(own, direct, 0, flowB.id)).toBeNull()
      expect(await lock(own, viaTarget, 0, flowB.id)).not.toBeNull()
      expect(await lock(own, viaTarget, 0, flowA.id)).toBeNull()
      // Without a flow id the flow check is skipped.
      expect(await lock(own, direct, 0)).not.toBeNull()
    })

    test("the share lock blocks move-to-draft but not another capture", async () => {
      const broadcastId = await createBroadcast(own)
      await addRecipient(own, broadcastId, 0, { deliveredAt: T_MID })
      await addRecipient(own, broadcastId, 1, { deliveredAt: T_MID })

      const second = new Client({ connectionString: databaseUrl as string })
      await second.connect()
      const third = new Client({ connectionString: databaseUrl as string })
      await third.connect()
      try {
        await client.query("BEGIN")
        await client.query(
          'SELECT 1 FROM "Broadcast" WHERE "id" = $1 FOR SHARE',
          [broadcastId],
        )
        await lock(own, broadcastId, 0)

        // A second share lock (another capture) is granted at once.
        await second.query("BEGIN")
        await second.query("SET LOCAL lock_timeout = '500ms'")
        await second.query(
          'SELECT 1 FROM "Broadcast" WHERE "id" = $1 FOR SHARE',
          [broadcastId],
        )
        await second.query("COMMIT")

        // The move-to-draft UPDATE has to wait for the capture.
        await third.query("BEGIN")
        await third.query("SET LOCAL lock_timeout = '300ms'")
        await expect(
          third.query(
            'UPDATE "Broadcast" SET "status" = \'draft\' WHERE "id" = $1',
            [broadcastId],
          ),
        ).rejects.toThrow("lock timeout")
        await third.query("ROLLBACK")
      } finally {
        await client.query("ROLLBACK")
        await second.end()
        await third.end()
      }
    })

    test("an uncommitted capture holds off a soft delete of the broadcast and a delete of the contact", async () => {
      const broadcastId = await createBroadcast(own)
      await addRecipient(own, broadcastId, 0, { deliveredAt: T_MID })

      const racer = new Client({ connectionString: databaseUrl as string })
      await racer.connect()
      try {
        await client.query("BEGIN")
        await lock(own, broadcastId, 0)
        await capture(own, 0, { sourceId: broadcastId })

        await racer.query("BEGIN")
        await racer.query("SET LOCAL lock_timeout = '300ms'")
        await expect(
          racer.query(
            'UPDATE "Broadcast" SET "deletedAt" = now() WHERE "id" = $1',
            [broadcastId],
          ),
        ).rejects.toThrow("lock timeout")
        await racer.query("ROLLBACK")

        await racer.query("BEGIN")
        await racer.query("SET LOCAL lock_timeout = '300ms'")
        await expect(
          racer.query('DELETE FROM "Contact" WHERE "id" = $1', [
            own.contactIds[0],
          ]),
        ).rejects.toThrow("lock timeout")
        await racer.query("ROLLBACK")
      } finally {
        await client.query("ROLLBACK")
        await racer.end()
      }
    })
  })
  describe("broadcast purge and draft cleanup", () => {
    const drain = (
      fixture: Fixture,
      broadcastId: string,
      onlyWhileDraft: boolean,
    ) =>
      purgeBroadcastCaptures({
        broadcastId,
        chunkSize: 2,
        interChunkDelayMs: 0,
        maxRunDurationMs: 30_000,
        onlyWhileDraft,
        workspaceId: fixture.workspaceId,
      })

    test("the draft guard deletes captures only while the broadcast is a draft", async () => {
      const draft = await createBroadcast(own, { status: "draft" })
      const scheduled = await createBroadcast(own, { status: "scheduled" })
      await capture(own, 0, { sourceId: draft })
      await capture(own, 0, { sourceId: scheduled })

      expect(await drain(own, draft, true)).toEqual({
        deleted: 1,
        stopReason: "drained",
      })
      // A re-scheduled broadcast's rows are never touched by the draft cleanup.
      expect(await drain(own, scheduled, true)).toEqual({
        deleted: 0,
        stopReason: "drained",
      })
      expect((await rows(own.workspaceId)).map((row) => row.sourceId)).toEqual([
        scheduled,
      ])
    })

    test("drains a soft-deleted broadcast in chunks without the draft guard", async () => {
      const broadcastId = await createBroadcast(own, { deletedAt: new Date() })
      await capture(own, 0, {
        infoTypes: ["phone", "email"],
        sourceId: broadcastId,
      })
      await capture(own, 1, { sourceId: broadcastId })

      expect(await drain(own, broadcastId, false)).toEqual({
        deleted: 3,
        stopReason: "drained",
      })
      expect(await rows(own.workspaceId)).toHaveLength(0)
    })

    test("hard delete is refused while a capture remains, then succeeds once drained", async () => {
      const broadcastId = await createBroadcast(own, { deletedAt: new Date() })
      await capture(own, 0, { sourceId: broadcastId })
      const args = { broadcastId, workspaceId: own.workspaceId }

      expect(await hardDeleteBroadcast(args)).toBe(false)
      expect(await drain(own, broadcastId, false)).toMatchObject({
        stopReason: "drained",
      })
      expect(await hardDeleteBroadcast(args)).toBe(true)
    })

    test("hard delete never removes a live broadcast", async () => {
      const broadcastId = await createBroadcast(own)

      expect(
        await hardDeleteBroadcast({
          broadcastId,
          workspaceId: own.workspaceId,
        }),
      ).toBe(false)
    })

    test("hard delete waits for an in-flight capture (FOR SHARE) and then sees its row", async () => {
      const broadcastId = await createBroadcast(own, { deletedAt: new Date() })
      const writer = new Client({ connectionString: databaseUrl as string })
      await writer.connect()
      try {
        await writer.query("BEGIN")
        await writer.query(
          'SELECT 1 FROM "Broadcast" WHERE "id" = $1 FOR SHARE',
          [broadcastId],
        )
        await writer.query(
          `INSERT INTO "ContactInfoCapture"
             ("workspaceId","sourceType","sourceId","infoType","contactId",
              "contactInboxId","inboxId","conversationId","createdAt")
           VALUES ($1,'broadcast',$2,'phone',$3,$4,$5,$6,now())`,
          [
            own.workspaceId,
            broadcastId,
            own.contactIds[0],
            own.contactInboxIds[0],
            own.inboxId,
            own.conversationIds[0],
          ],
        )

        const purge = hardDeleteBroadcast({
          broadcastId,
          workspaceId: own.workspaceId,
        })
        // The FOR UPDATE lock queues behind the capture's share lock.
        await new Promise((resolve) => setTimeout(resolve, 300))
        await writer.query("COMMIT")

        expect(await purge).toBe(false)
        expect(await rows(own.workspaceId)).toHaveLength(1)
      } finally {
        await writer.end()
      }
    })

    test("a capture write after the broadcast was moved to draft is refused", async () => {
      const broadcastId = await createBroadcast(own, { status: "draft" })
      await addRecipient(own, broadcastId, 0, { deliveredAt: T_MID })

      expect(
        await broadcastRepository.lockRecipientForAttribution(
          {
            broadcastId,
            contactId: own.contactIds[0],
            workspaceId: own.workspaceId,
          },
          database(),
        ),
      ).toBeNull()
    })
  })
})
