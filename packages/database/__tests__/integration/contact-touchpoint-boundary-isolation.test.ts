// @vitest-environment node

/**
 * Boundary matrix for the inbox "Opted In through" feed, part 1: for each of
 * the 13 kinds, another contact of the same workspace and a resource of a
 * foreign workspace never contribute, and a soft-deleted parent drops out where
 * the parent really supports it.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm exec dotenv -e ../../.env -- pnpm exec vitest run <this file>`.
 */

import { describe, expect, test } from "vitest"
import { contactTouchpointKinds } from "../../src/partials/contact-touchpoint"
import {
  at,
  databaseUrl,
  installBoundaryWorld,
  newId,
} from "./contact-touchpoint-boundary-fixtures"

describe.skipIf(!databaseUrl)(
  "contact touchpoint boundary: per-kind isolation and soft delete",
  async () => {
    const { contactTouchpointRepository } = await import(
      "../../src/repositories/contact-touchpoint/repository"
    )
    const ctx = installBoundaryWorld(contactTouchpointRepository)
    const { byKind, keys, makeContact, makeContactInbox, makeInbox, seeders } =
      ctx

    describe.each(contactTouchpointKinds.options)("boundary: %s", (kind) => {
      const seeder = seeders[kind]
      const t1 = at("2026-09-10T00:00:00")

      test("control: the contact's own event in its own workspace shows at its time", async () => {
        const parent = await seeder.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        const key = await seeder.add(parent, {
          rowWs: ctx.world.workspaceId,
          contactId: ctx.world.contactId,
          ci: ctx.world.contactInboxId,
          when: t1,
          n: 0,
        })

        const rows = await byKind(kind)

        expect(keys(rows)).toContain(key)
        expect(rows.find((row) => row.resourceKey === key)?.occurredAt).toEqual(
          t1,
        )
      })

      test("another contact of the same workspace contributes nothing, earlier or later", async () => {
        const other = await makeContact(ctx.world.workspaceId)
        const otherCi = await makeContactInbox(other, ctx.world.inboxId)
        const parent = await seeder.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        const otherKeys = [] as string[]
        for (const [n, when] of [
          at("2000-01-01T00:00:00"),
          at("2030-01-01T00:00:00"),
        ].entries()) {
          otherKeys.push(
            await seeder.add(parent, {
              rowWs: ctx.world.workspaceId,
              contactId: other,
              ci: otherCi,
              when,
              n,
            }),
          )
          if (!seeder.repeatable && kind !== "inboxSource") {
            break
          }
        }

        const rows = await byKind(kind)
        expect(keys(rows).filter((key) => otherKeys.includes(key))).toEqual([])

        // Same resource: the other contact's events must not move my time or count.
        const mine = await seeder
          .add(parent, {
            rowWs: ctx.world.workspaceId,
            contactId: ctx.world.contactId,
            ci: ctx.world.contactInboxId,
            when: t1,
            n: 9,
          })
          .catch((error: unknown) => {
            throw new Error(`own event after other contact failed: ${error}`)
          })
        const after = (await byKind(kind)).find(
          (row) => row.resourceKey === mine,
        )
        expect(after?.occurredAt).toEqual(t1)
        if (seeder.countField) {
          expect(after?.details[seeder.countField]).toBe(1)
        }
      })

      test("a resource of a foreign workspace never contributes", async () => {
        const foreignContact = ctx.world.contactId
        const foreignInbox = await makeInbox(ctx.world.otherWorkspaceId)
        const foreignCi = await makeContactInbox(foreignContact, foreignInbox)
        const parent = await seeder.make(
          ctx.world.otherWorkspaceId,
          foreignInbox,
          newId(),
        )
        const key = await seeder.add(parent, {
          rowWs: ctx.world.otherWorkspaceId,
          contactId: foreignContact,
          ci: foreignCi,
          when: t1,
          n: 0,
        })

        expect(keys(await byKind(kind))).not.toContain(key)
      })

      test("an event row of this workspace pointing at a foreign workspace's parent never contributes", async () => {
        if (kind === "inboxSource") {
          // The ContactInbox is the membership itself: its inbox's workspace is
          // the only scope, already covered by the foreign-workspace case.
          return
        }
        const foreignInbox = await makeInbox(ctx.world.otherWorkspaceId)
        const parent = await seeder.make(
          ctx.world.otherWorkspaceId,
          foreignInbox,
          newId(),
        )
        const key = await seeder.add(parent, {
          rowWs: ctx.world.workspaceId,
          contactId: ctx.world.contactId,
          ci: ctx.world.contactInboxId,
          when: t1,
          n: 0,
        })

        expect(keys(await byKind(kind))).not.toContain(key)
      })
    })

    describe("soft delete (only where the parent has a column for it)", () => {
      test("leaderboard: deletedAt hides and restoring shows again", async () => {
        const board = await seeders.leaderboard.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        await seeders.leaderboard.add(board, {
          rowWs: ctx.world.workspaceId,
          contactId: ctx.world.contactId,
          ci: ctx.world.contactInboxId,
          when: at("2026-09-01T00:00:00"),
          n: 0,
        })
        expect(keys(await byKind("leaderboard"))).toEqual([board])
        await ctx.client.query(
          `UPDATE "Leaderboard" SET "deletedAt" = now() WHERE id = $1`,
          [board],
        )
        expect(await byKind("leaderboard")).toEqual([])
        await ctx.client.query(
          `UPDATE "Leaderboard" SET "deletedAt" = NULL WHERE id = $1`,
          [board],
        )
        expect(keys(await byKind("leaderboard"))).toEqual([board])
      })

      test("questionnaire: deletedAt hides the parent and restoring shows it again", async () => {
        const q = await seeders.questionnaire.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        await seeders.questionnaire.add(q, {
          rowWs: ctx.world.workspaceId,
          contactId: ctx.world.contactId,
          ci: ctx.world.contactInboxId,
          when: at("2026-09-01T00:00:00"),
          n: 0,
        })
        await ctx.client.query(
          `UPDATE "Questionnaire" SET "deletedAt" = now() WHERE id = $1`,
          [q],
        )
        expect(await byKind("questionnaire")).toEqual([])
        await ctx.client.query(
          `UPDATE "Questionnaire" SET "deletedAt" = NULL WHERE id = $1`,
          [q],
        )
        expect(keys(await byKind("questionnaire"))).toEqual([q])
      })

      test("postComment: ChannelPost.removedAt hides the post; its sibling stays", async () => {
        const removed = await seeders.postComment.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        const live = await seeders.postComment.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        for (const post of [removed, live]) {
          await seeders.postComment.add(post, {
            rowWs: ctx.world.workspaceId,
            contactId: ctx.world.contactId,
            ci: ctx.world.contactInboxId,
            when: at("2026-09-01T00:00:00"),
            n: 0,
          })
        }
        await ctx.client.query(
          `UPDATE "ChannelPost" SET "removedAt" = now() WHERE id = $1`,
          [removed],
        )
        expect(keys(await byKind("postComment"))).toEqual([live])
      })

      test("kinds whose parent has no soft-delete column have none to honour", async () => {
        // Guard against inventing columns: if a parent gains one, this fails and
        // the matrix above must learn the new rule.
        const { rows } = await ctx.client.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.columns
         WHERE column_name IN ('deletedAt','removedAt','archivedAt')
           AND table_name IN ('Minigame','MiniApp','Poll','FacebookLeadAdsAutomation','InboundWebhook','CommentAutomation','Reflink','MagicLink','WhatsappFlow','IntegrationWhatsapp','Inbox','ContactInbox')`,
        )
        expect(rows.map((row) => row.table_name)).toEqual([])
      })
    })
  },
)
