// @vitest-environment node

/**
 * `broadcastRepository.listForContact` against a real Postgres: which
 * recipient rows count as "a broadcast sent to this contact", and that keyset
 * paging neither skips nor repeats rows, including broadcasts scheduled at
 * the same instant. The fixture is committed and removed again in `afterAll`
 * (workspace deletion cascades to every row created here).
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

type BroadcastFixture = {
  name: string
  status?: "draft" | "scheduled" | "sent" | "failed" | "cancelled"
  schedulesAt: Date
  deleted?: boolean
  inOtherWorkspace?: boolean
  recipient: { sent: boolean; failedAt?: Date; deliveredAt?: Date }
}

describe.skipIf(!databaseUrl)(
  "broadcastRepository.listForContact against Postgres",
  async () => {
    const { db } = await import("../../src/client")
    const { broadcastRepository } = await import(
      "../../src/repositories/broadcast"
    )
    const schema = await import("../../src/schema")

    const stamp = `${Date.now()}-${Math.random()}`
    let ownerId: string
    let workspaceId: string
    let otherWorkspaceId: string
    let contactId: string
    let contactInboxId: string
    let conversationId: string

    const day = (offset: number): Date =>
      new Date(Date.UTC(2026, 0, 10 + offset))

    const addBroadcast = async (fixture: BroadcastFixture): Promise<string> => {
      const [broadcast] = await db
        .insert(schema.broadcastModel)
        .values({
          name: fixture.name,
          workspaceId: fixture.inOtherWorkspace
            ? otherWorkspaceId
            : workspaceId,
          status: fixture.status ?? "sent",
          schedulesType: "now",
          schedulesAt: fixture.schedulesAt,
          subaction: "webchatMessage",
          channel: "webchat",
          deletedAt: fixture.deleted ? new Date() : null,
        })
        .returning({ id: schema.broadcastModel.id })
      await db.insert(schema.contactsOnBroadcastsModel).values({
        broadcastId: broadcast.id,
        contactId,
        contactInboxId,
        conversationId,
        ...fixture.recipient,
      })
      return broadcast.id
    }

    const listAll = async (limit: number): Promise<string[]> => {
      const ids: string[] = []
      let cursor: { schedulesAt: Date; broadcastId: string } | undefined
      for (let page = 0; page < 20; page++) {
        const rows = await broadcastRepository.listForContact({
          workspaceId,
          contactId,
          limit,
          cursor,
        })
        const data = rows.slice(0, limit)
        ids.push(...data.map((row) => row.broadcastId))
        const last = data.at(-1)
        if (rows.length <= limit || !last) {
          return ids
        }
        cursor = {
          schedulesAt: last.schedulesAt,
          broadcastId: last.broadcastId,
        }
      }
      throw new Error("paging did not terminate")
    }

    beforeAll(async () => {
      const [owner] = await db
        .insert(schema.userModel)
        .values({ email: `broadcast-for-contact-${stamp}@example.test` })
        .returning({ id: schema.userModel.id })
      ownerId = owner.id
      const [workspace, otherWorkspace] = await db
        .insert(schema.workspaceModel)
        .values([
          { name: "broadcast-for-contact", ownerId },
          { name: "broadcast-for-contact-other", ownerId },
        ])
        .returning({ id: schema.workspaceModel.id })
      workspaceId = workspace.id
      otherWorkspaceId = otherWorkspace.id
      const [inbox] = await db
        .insert(schema.inboxModel)
        .values({
          name: "broadcast-for-contact",
          channel: "webchat",
          sourceId: `broadcast-for-contact-${stamp}`,
          workspaceId,
        })
        .returning({ id: schema.inboxModel.id })
      const [contact] = await db
        .insert(schema.contactModel)
        .values({ workspaceId })
        .returning({ id: schema.contactModel.id })
      contactId = contact.id
      const [contactInbox] = await db
        .insert(schema.contactInboxModel)
        .values({
          originalContactId: contactId,
          contactId,
          inboxId: inbox.id,
          channel: "webchat",
          source: "webchat",
          sourceId: `broadcast-for-contact-${stamp}`,
        })
        .returning({ id: schema.contactInboxModel.id })
      contactInboxId = contactInbox.id
      const [conversation] = await db
        .insert(schema.conversationModel)
        .values({ workspaceId, contactId })
        .returning({ id: schema.conversationModel.id })
      conversationId = conversation.id
    })

    afterAll(async () => {
      await db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspaceId))
      await db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, otherWorkspaceId))
      await db.delete(schema.userModel).where(eq(schema.userModel.id, ownerId))
    })

    test("lists only broadcasts that reached the contact, newest first", async () => {
      const sentOld = await addBroadcast({
        name: "sent old",
        schedulesAt: day(0),
        recipient: { sent: true },
      })
      const failed = await addBroadcast({
        name: "failed",
        status: "failed",
        schedulesAt: day(1),
        recipient: { sent: false, failedAt: day(1) },
      })
      const delivered = await addBroadcast({
        name: "delivered",
        schedulesAt: day(2),
        recipient: { sent: true, deliveredAt: day(2) },
      })
      await addBroadcast({
        name: "prepared only",
        status: "scheduled",
        schedulesAt: day(3),
        recipient: { sent: false },
      })
      await addBroadcast({
        name: "draft",
        status: "draft",
        schedulesAt: day(4),
        recipient: { sent: true },
      })
      await addBroadcast({
        name: "deleted",
        schedulesAt: day(5),
        deleted: true,
        recipient: { sent: true },
      })
      await addBroadcast({
        name: "other workspace",
        schedulesAt: day(6),
        inOtherWorkspace: true,
        recipient: { sent: true },
      })

      const rows = await broadcastRepository.listForContact({
        workspaceId,
        contactId,
        limit: 20,
      })

      expect(rows.map((row) => row.broadcastId)).toEqual([
        delivered,
        failed,
        sentOld,
      ])
      expect(rows[0]).toMatchObject({
        name: "delivered",
        status: "sent",
        channel: "webchat",
        sent: true,
        deliveredAt: day(2),
        failedAt: null,
      })
      expect(rows[1]).toMatchObject({ sent: false, failedAt: day(1) })
    })

    test("fetches one row past the limit so the caller can see another page exists", async () => {
      const rows = await broadcastRepository.listForContact({
        workspaceId,
        contactId,
        limit: 2,
      })

      expect(rows).toHaveLength(3)
    })

    test("keyset paging returns every row once, even for broadcasts scheduled at the same instant", async () => {
      const tieA = await addBroadcast({
        name: "tie a",
        schedulesAt: day(10),
        recipient: { sent: true },
      })
      const tieB = await addBroadcast({
        name: "tie b",
        schedulesAt: day(10),
        recipient: { sent: true },
      })
      const tieC = await addBroadcast({
        name: "tie c",
        schedulesAt: day(10),
        recipient: { sent: true },
      })

      const everything = await listAll(100)
      const paged = await listAll(2)

      expect(paged).toEqual(everything)
      expect(new Set(paged).size).toBe(paged.length)
      // Same instant: the higher id comes first, the tie-break of the cursor.
      expect(paged.filter((id) => [tieA, tieB, tieC].includes(id))).toEqual([
        tieC,
        tieB,
        tieA,
      ])
    })

    test("search finds a broadcast by part of its name, ignoring case, or by its exact id", async () => {
      const percent = await addBroadcast({
        name: "Sale 50% off",
        schedulesAt: day(20),
        recipient: { sent: true },
      })
      const plain = await addBroadcast({
        name: "Sale 5000 items",
        schedulesAt: day(21),
        recipient: { sent: true },
      })
      const search = async (text: string): Promise<string[]> =>
        (
          await broadcastRepository.listForContact({
            workspaceId,
            contactId,
            limit: 50,
            search: text,
          })
        ).map((row) => row.broadcastId)

      expect(await search("sale")).toEqual([plain, percent])
      // `%` is text, not a wildcard: "5%" must not match "5000".
      expect(await search("50%")).toEqual([percent])
      expect(await search(percent)).toEqual([percent])
      expect(await search("no such broadcast")).toEqual([])
    })

    test("search never reaches a broadcast the contact was not sent, and survives an id too long for a bigint", async () => {
      await addBroadcast({
        name: "needle draft",
        status: "draft",
        schedulesAt: day(22),
        recipient: { sent: true },
      })
      const search = async (text: string): Promise<string[]> =>
        (
          await broadcastRepository.listForContact({
            workspaceId,
            contactId,
            limit: 50,
            search: text,
          })
        ).map((row) => row.name)

      expect(await search("needle")).toEqual([])
      expect(await search("99999999999999999999")).toEqual([])
    })

    test("only broadcasts of the asked workspace are listed", async () => {
      const rows = await broadcastRepository.listForContact({
        workspaceId: otherWorkspaceId,
        contactId,
        limit: 20,
      })

      expect(rows.map((row) => row.name)).toEqual(["other workspace"])
    })
  },
)
