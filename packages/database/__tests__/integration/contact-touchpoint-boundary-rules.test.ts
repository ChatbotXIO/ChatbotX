// @vitest-environment node

/**
 * Boundary matrix for the inbox "Opted In through" feed, part 2: nullable
 * columns and the kind-specific rules (statuses, counters, re-votes, ...).
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm exec dotenv -e ../../.env -- pnpm exec vitest run <this file>`.
 */

import { drizzle } from "drizzle-orm/node-postgres"
import { describe, expect, test } from "vitest"
import { inboundWebhookRequestStatusValues } from "../../src/partials/inbound-webhook"
import { relations } from "../../src/relations"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import {
  at,
  databaseUrl,
  installBoundaryWorld,
  newId,
} from "./contact-touchpoint-boundary-fixtures"

describe.skipIf(!databaseUrl)(
  "contact touchpoint boundary: nullable fields and kind rules",
  async () => {
    const { contactTouchpointRepository } = await import(
      "../../src/repositories/contact-touchpoint/repository"
    )
    const { contactActivityRepository } = await import(
      "../../src/repositories/contact-activity/repository"
    )
    const ctx = installBoundaryWorld(contactTouchpointRepository)
    const {
      byKind,
      insert,
      keys,
      makeContact,
      makeContactInbox,
      makeInbox,
      seeders,
    } = ctx

    describe("nullable fields", () => {
      const seedPost = async (caption: string | null) => {
        const post = newId()
        await insert("ChannelPost", {
          id: post,
          workspaceId: ctx.world.workspaceId,
          inboxId: ctx.world.inboxId,
          channel: "instagram",
          integrationId: "1",
          sourceAccountId: "acc",
          externalPostId: `ext-${post}`,
          caption,
          permalink: null,
          thumbnail: null,
        })
        await insert("ContactInboxPost", {
          workspaceId: ctx.world.workspaceId,
          contactInboxId: ctx.world.contactInboxId,
          postId: post,
          commentedAt: at("2026-09-01T00:00:00"),
        })
        return post
      }

      test.each([
        ["null", null, null],
        ["empty", "", ""],
        ["exactly 200", "a".repeat(200), "a".repeat(200)],
        ["201", "a".repeat(201), "a".repeat(200)],
        ["500", "b".repeat(500), "b".repeat(200)],
        ["multi-byte at the limit", "é".repeat(250), "é".repeat(200)],
      ])("postComment caption %s -> resourceName", async (_label, caption, expected) => {
        await seedPost(caption)

        const [row] = await byKind("postComment")

        expect(row.resourceName).toBe(expected)
        expect(row.details).toEqual({ permalink: null, thumbnail: null })
      })

      test("postComment: an emoji (astral) caption is cut on code points, never mid-surrogate", async () => {
        await seedPost("😀".repeat(300))

        const [row] = await byKind("postComment")

        expect(Array.from(row.resourceName ?? "")).toHaveLength(200)
      })

      test("leadForm: null formName is kept null and the automation name is the resource name", async () => {
        const automation = newId()
        await insert("FacebookLeadAdsAutomation", {
          id: automation,
          name: "Leads",
          workspaceId: ctx.world.workspaceId,
          pageId: "p",
          formId: `f-${automation}`,
          formName: null,
        })
        await seeders.leadForm.add(automation, {
          rowWs: ctx.world.workspaceId,
          contactId: ctx.world.contactId,
          ci: ctx.world.contactInboxId,
          when: at("2026-09-01T00:00:00"),
          n: 0,
        })

        const [row] = await byKind("leadForm")

        expect(row).toMatchObject({
          resourceName: "Leads",
          details: { formName: null, leads: 1 },
        })
      })

      test("poll: deleting the chosen candidate cascades the vote away (candidateId is NOT NULL, so there is no null-candidate row)", async () => {
        const poll = await seeders.poll.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        await seeders.poll.add(poll, {
          rowWs: ctx.world.workspaceId,
          contactId: ctx.world.contactId,
          ci: ctx.world.contactInboxId,
          when: at("2026-09-01T00:00:00"),
          n: 0,
        })
        expect((await byKind("poll"))[0].details).toEqual({
          candidateName: "Alice",
        })

        await ctx.client.query(
          `DELETE FROM "PollCandidate" WHERE "pollId" = $1`,
          [poll],
        )

        expect(await byKind("poll")).toEqual([])
      })
    })

    describe("kind rules", () => {
      test("minigame: details.played is the membership counter, not the count of play logs", async () => {
        const game = await seeders.minigame.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        await insert("MinigameContact", {
          id: newId(),
          minigameId: game,
          contactId: ctx.world.contactId,
          openedAt: at("2026-04-01T00:00:00"),
          played: 5,
        })
        for (const day of ["02", "03"]) {
          await insert("MinigamePlay", {
            id: newId(),
            minigameId: game,
            contactId: ctx.world.contactId,
            isWinning: false,
            createdAt: at(`2026-04-${day}T00:00:00`),
          })
        }

        const [row] = await byKind("minigame")

        expect(row.details.played).toBe(5)
        expect(row.occurredAt).toEqual(at("2026-04-03T00:00:00"))
      })

      test("minigame: played 3 with no play log still shows (openedAt) with played 3", async () => {
        const game = await seeders.minigame.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        await insert("MinigameContact", {
          id: newId(),
          minigameId: game,
          contactId: ctx.world.contactId,
          openedAt: at("2026-04-01T00:00:00"),
          played: 3,
        })

        const [row] = await byKind("minigame")

        expect(row.details).toMatchObject({ played: 3, lastWon: null })
        expect(row.occurredAt).toEqual(at("2026-04-01T00:00:00"))
      })

      test("minigame: another contact's plays on the same game do not become my latest play", async () => {
        const game = await seeders.minigame.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        const other = await makeContact(ctx.world.workspaceId)
        await insert("MinigameContact", {
          id: newId(),
          minigameId: game,
          contactId: ctx.world.contactId,
          openedAt: at("2026-04-01T00:00:00"),
          played: 1,
        })
        await insert("MinigamePlay", {
          id: newId(),
          minigameId: game,
          contactId: other,
          isWinning: true,
          prizeName: "Theirs",
          createdAt: at("2026-05-01T00:00:00"),
        })

        const [row] = await byKind("minigame")

        expect(row.details).toMatchObject({
          lastPrizeName: null,
          lastWon: null,
        })
        expect(row.occurredAt).toEqual(at("2026-04-01T00:00:00"))
      })

      test("poll: a re-vote moves the time to the re-vote (updatedAt), not the first vote", async () => {
        const poll = await seeders.poll.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        await seeders.poll.add(poll, {
          rowWs: ctx.world.workspaceId,
          contactId: ctx.world.contactId,
          ci: ctx.world.contactInboxId,
          when: at("2026-07-06T00:00:00"),
          n: 0,
        })
        const before = (await byKind("poll"))[0].occurredAt
        await ctx.client.query(
          `UPDATE "PollVote" SET "updatedAt" = $2 WHERE "pollId" = $1`,
          [poll, at("2026-07-20T00:00:00")],
        )
        const after = await byKind("poll")

        expect(before).toEqual(at("2026-07-06T00:00:00"))
        expect(after).toHaveLength(1)
        expect(after[0].occurredAt).toEqual(at("2026-07-20T00:00:00"))
      })

      test("questionnaire: a parent whose only attempts are cancelled, failed and timed out is absent", async () => {
        const q = await seeders.questionnaire.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        for (const status of ["cancelled", "failed", "timeout"]) {
          await insert("QuestionnaireSubmission", {
            id: newId(),
            workspaceId: ctx.world.workspaceId,
            questionnaireId: q,
            contactId: ctx.world.contactId,
            status,
            startedAt: at("2026-06-10T00:00:00"),
          })
        }

        expect(await byKind("questionnaire")).toEqual([])
      })

      test.each(
        inboundWebhookRequestStatusValues.map((status) => [
          status,
          status === "processed" || status === "completedWithErrors",
        ]),
      )("inboundWebhook: status %s counts=%s", async (status, counts) => {
        const hook = await seeders.inboundWebhook.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        await insert("InboundWebhookRequest", {
          id: newId(),
          workspaceId: ctx.world.workspaceId,
          inboundWebhookId: hook,
          contactId: ctx.world.contactId,
          status,
          payload: {},
          createdAt: at("2026-07-01T00:00:00"),
        })

        const rows = await byKind("inboundWebhook")

        expect(rows).toHaveLength(counts ? 1 : 0)
        if (counts) {
          expect(rows[0].details).toEqual({ requests: 1 })
        }
      })

      test("commentAutomation (characterization): sent AND failed events are both counted as `replies`", async () => {
        const automation = await seeders.commentAutomation.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        for (const [status, day] of [
          ["sent", "01"],
          ["sent", "02"],
          ["failed", "03"],
        ] as const) {
          await insert("CommentAutomationEvent", {
            id: newId(),
            workspaceId: ctx.world.workspaceId,
            automationId: automation,
            contactId: ctx.world.contactId,
            postId: "p",
            commentId: `c-${newId()}`,
            replyChannel: "private",
            replyType: "text",
            status,
            occurredAt: at(`2026-07-${day}T00:00:00`),
          })
        }

        const [row] = await byKind("commentAutomation")

        // CURRENT behaviour: no status filter, so a failed attempt counts and
        // moves the time. Reported to the owner; do not change silently.
        expect(row.details).toMatchObject({ replies: 3 })
        expect(row.occurredAt).toEqual(at("2026-07-03T00:00:00"))
      })

      test("commentAutomation: only-failed events still produce a row (characterization)", async () => {
        const automation = await seeders.commentAutomation.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        await insert("CommentAutomationEvent", {
          id: newId(),
          workspaceId: ctx.world.workspaceId,
          automationId: automation,
          contactId: ctx.world.contactId,
          postId: "p",
          commentId: `c-${newId()}`,
          replyChannel: "private",
          replyType: "text",
          status: "failed",
          occurredAt: at("2026-07-03T00:00:00"),
        })

        expect(keys(await byKind("commentAutomation"))).toEqual([automation])
      })

      test("refLink: both link types are reported with their type", async () => {
        const flowId = newId()
        await insert("Flow", {
          id: flowId,
          name: "F",
          workspaceId: ctx.world.workspaceId,
        })
        const ids = { refLink: newId(), qrCode: newId() }
        for (const [type, id] of Object.entries(ids)) {
          await insert("Reflink", {
            id,
            name: type,
            type,
            flowId,
            workspaceId: ctx.world.workspaceId,
          })
          await insert("RefLinkStat", {
            workspaceId: ctx.world.workspaceId,
            linkId: id,
            contactId: ctx.world.contactId,
            contactInboxId: ctx.world.contactInboxId,
            occurredAt: at("2026-07-01T00:00:00"),
          })
        }

        const rows = await byKind("refLink")

        expect(
          Object.fromEntries(
            rows.map((row) => [row.resourceKey, row.details.linkType]),
          ),
        ).toEqual({ [ids.refLink]: "refLink", [ids.qrCode]: "qrCode" })
      })

      test("magicLink: clicks through several of the contact's inboxes add up on one row", async () => {
        const link = await seeders.magicLink.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        const secondInbox = await makeInbox(ctx.world.workspaceId)
        const secondCi = await makeContactInbox(
          ctx.world.contactId,
          secondInbox,
        )
        for (const [ci, day] of [
          [ctx.world.contactInboxId, "01"],
          [secondCi, "05"],
        ] as const) {
          await insert("MagicLinkStat", {
            workspaceId: ctx.world.workspaceId,
            linkId: link,
            contactId: ctx.world.contactId,
            contactInboxId: ci,
            occurredAt: at(`2026-07-${day}T00:00:00`),
          })
        }

        const [row] = await byKind("magicLink")

        expect(row.details).toEqual({ clicks: 2 })
        expect(row.occurredAt).toEqual(at("2026-07-05T00:00:00"))
      })

      test("form: firstOccurredAt keeps the earliest completion when events arrive out of order", async () => {
        const db = drizzle({ client: ctx.client, relations, schema })
        const flow = await seeders.form.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        const record = (occurredAt: Date) => ({
          contactId: ctx.world.contactId,
          activityType: "formCompleted" as const,
          referenceType: "whatsappFlow" as const,
          parentReferenceId: "0",
          referenceId: flow,
          occurredAt,
        })
        for (const when of [
          at("2026-07-10T00:00:00"),
          at("2026-07-02T00:00:00"),
          at("2026-07-15T00:00:00"),
        ]) {
          await contactActivityRepository.upsertActivities(
            { workspaceId: ctx.world.workspaceId, records: [record(when)] },
            db,
          )
        }

        const rows = await byKind("form")

        expect(rows).toHaveLength(1)
        expect(rows[0].occurredAt).toEqual(at("2026-07-02T00:00:00"))
        expect(rows[0].channel).toBe("whatsapp")
      })
    })
  },
)
