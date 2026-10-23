import { db, eq } from "@chatbotx.io/database/client"
import { contactInboxModel, workspaceModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  assertThrowawayDatabase,
  closeDatabase,
  hasThrowawayDatabase,
} from "./support/real-database"
import { renderForContact } from "./support/render"
import {
  numericId,
  seedAgent,
  seedAppointment,
  seedCalendar,
  seedContact,
  seedMessage,
  seedMessengerChannel,
  seedQuestionnaire,
  seedSubmission,
  seedTeam,
  seedUser,
  seedWorkspace,
} from "./support/seed"

type World = Awaited<ReturnType<typeof buildWorld>>

const buildWorld = async () => {
  const { workspace } = await seedWorkspace()
  const channel = await seedMessengerChannel(workspace.id, numericId())
  const contact = await seedContact({
    workspaceId: workspace.id,
    inboxId: channel.inboxId,
    channel: "messenger",
    sourceId: numericId(),
  })
  return { workspaceId: workspace.id, inboxId: channel.inboxId, contact }
}

const render = (
  world: World,
  text: string,
  extra: { sentByUserId?: string; appointmentId?: string } = {},
) =>
  renderForContact({
    contactId: world.contact.contactId,
    contactInboxId: world.contact.contactInboxId,
    text,
    ...extra,
  })

const at = (isoDay: string) => new Date(`${isoDay}T08:00:00.000Z`)

describe.skipIf(!hasThrowawayDatabase())(
  "variables rendered from real seeded data",
  () => {
    beforeAll(assertThrowawayDatabase)
    afterAll(closeDatabase)

    describe("last_points", () => {
      const TEMPLATE = "[{{last_points}}]"

      test("a contact with no submission renders 0", async () => {
        const world = await buildWorld()
        expect(await render(world, TEMPLATE)).toBe("[0]")
      })

      test("renders the score of the latest completed submission", async () => {
        const world = await buildWorld()
        const questionnaireId = await seedQuestionnaire(world.workspaceId)
        await seedSubmission({
          workspaceId: world.workspaceId,
          questionnaireId,
          contactId: world.contact.contactId,
          status: "completed",
          totalPoints: 7,
          completedAt: at("2026-10-01"),
        })
        expect(await render(world, TEMPLATE)).toBe("[7]")
      })

      test("ignores a newer in-progress submission and a newer completed one without a score", async () => {
        const world = await buildWorld()
        const questionnaireId = await seedQuestionnaire(world.workspaceId)
        const base = {
          workspaceId: world.workspaceId,
          questionnaireId,
          contactId: world.contact.contactId,
        }
        await seedSubmission({
          ...base,
          status: "completed",
          totalPoints: 7,
          completedAt: at("2026-10-01"),
        })
        await seedSubmission({
          ...base,
          status: "completed",
          totalPoints: null,
          completedAt: at("2026-10-05"),
        })
        await seedSubmission({
          ...base,
          status: "inProgress",
          totalPoints: 99,
          completedAt: null,
        })
        expect(await render(world, TEMPLATE)).toBe("[7]")
      })

      test("across two questionnaires the most recent completion wins, regardless of creation order", async () => {
        const world = await buildWorld()
        const first = await seedQuestionnaire(world.workspaceId)
        const second = await seedQuestionnaire(world.workspaceId)
        // `second` is created later but completed earlier.
        await seedSubmission({
          workspaceId: world.workspaceId,
          questionnaireId: first,
          contactId: world.contact.contactId,
          status: "completed",
          totalPoints: 12,
          completedAt: at("2026-10-09"),
        })
        await seedSubmission({
          workspaceId: world.workspaceId,
          questionnaireId: second,
          contactId: world.contact.contactId,
          status: "completed",
          totalPoints: 3,
          completedAt: at("2026-10-02"),
        })
        expect(await render(world, TEMPLATE)).toBe("[12]")
      })

      test("keeps a legitimate zero and a negative score", async () => {
        const zero = await buildWorld()
        const negative = await buildWorld()
        for (const [world, points] of [
          [zero, 0],
          [negative, -3],
        ] as const) {
          await seedSubmission({
            workspaceId: world.workspaceId,
            questionnaireId: await seedQuestionnaire(world.workspaceId),
            contactId: world.contact.contactId,
            status: "completed",
            totalPoints: points,
            completedAt: at("2026-10-03"),
          })
        }
        expect(await render(zero, TEMPLATE)).toBe("[0]")
        expect(await render(negative, TEMPLATE)).toBe("[-3]")
      })

      test("another contact's or workspace's newer score never leaks", async () => {
        const mine = await buildWorld()
        const theirs = await buildWorld()
        await seedSubmission({
          workspaceId: mine.workspaceId,
          questionnaireId: await seedQuestionnaire(mine.workspaceId),
          contactId: mine.contact.contactId,
          status: "completed",
          totalPoints: 7,
          completedAt: at("2026-10-01"),
        })
        await seedSubmission({
          workspaceId: theirs.workspaceId,
          questionnaireId: await seedQuestionnaire(theirs.workspaceId),
          contactId: theirs.contact.contactId,
          status: "completed",
          totalPoints: 99,
          completedAt: at("2026-10-20"),
        })
        expect(await render(mine, TEMPLATE)).toBe("[7]")
        expect(await render(theirs, TEMPLATE)).toBe("[99]")
      })
    })

    describe("booking_id", () => {
      const TEMPLATE = "[{{booking_id}}]"

      test("no appointment renders blank", async () => {
        const world = await buildWorld()
        expect(await render(world, TEMPLATE)).toBe("[]")
      })

      test("falls back to the most recently created scheduled appointment, not the latest start", async () => {
        const world = await buildWorld()
        const calendarId = await seedCalendar(world.workspaceId)
        const base = {
          workspaceId: world.workspaceId,
          calendarId,
          contactId: world.contact.contactId,
        }
        await seedAppointment({
          ...base,
          startAt: at("2026-12-30"),
          createdAt: at("2026-10-01"),
        })
        const newer = await seedAppointment({
          ...base,
          startAt: at("2026-11-01"),
          createdAt: at("2026-10-02"),
        })
        expect(await render(world, TEMPLATE)).toBe(`[${newer}]`)
      })

      test("an explicit appointment id wins, even if cancelled; the fallback skips cancelled ones", async () => {
        const world = await buildWorld()
        const calendarId = await seedCalendar(world.workspaceId)
        const base = {
          workspaceId: world.workspaceId,
          calendarId,
          contactId: world.contact.contactId,
        }
        const kept = await seedAppointment({
          ...base,
          startAt: at("2026-11-01"),
          createdAt: at("2026-10-01"),
        })
        const cancelled = await seedAppointment({
          ...base,
          startAt: at("2026-11-02"),
          createdAt: at("2026-10-02"),
          status: "cancelled",
        })
        expect(await render(world, TEMPLATE)).toBe(`[${kept}]`)
        expect(
          await render(world, TEMPLATE, { appointmentId: cancelled }),
        ).toBe(`[${cancelled}]`)
      })

      test("a foreign or missing explicit id renders blank and does not fall back", async () => {
        const mine = await buildWorld()
        const theirs = await buildWorld()
        await seedAppointment({
          workspaceId: mine.workspaceId,
          calendarId: await seedCalendar(mine.workspaceId),
          contactId: mine.contact.contactId,
          startAt: at("2026-11-01"),
        })
        const foreign = await seedAppointment({
          workspaceId: theirs.workspaceId,
          calendarId: await seedCalendar(theirs.workspaceId),
          contactId: theirs.contact.contactId,
          startAt: at("2026-11-01"),
        })
        expect(await render(mine, TEMPLATE, { appointmentId: foreign })).toBe(
          "[]",
        )
        expect(
          await render(mine, TEMPLATE, { appointmentId: createId() }),
        ).toBe("[]")
      })
    })

    describe("admin_name / admin_team_name (inbox sender)", () => {
      const TEMPLATE = "[{{admin_name}}]/[{{admin_team_name}}]"

      test("a member in zero, one and three teams", async () => {
        const world = await buildWorld()
        const none = await seedAgent(world.workspaceId, "Zed")
        const one = await seedAgent(world.workspaceId, "Grace")
        const three = await seedAgent(world.workspaceId, "Linus")
        await seedTeam(world.workspaceId, "Sales", [one.id])
        // Inserted out of alphabetical order on purpose.
        await seedTeam(world.workspaceId, "Support", [three.id])
        await seedTeam(world.workspaceId, "Billing", [three.id])
        await seedTeam(world.workspaceId, "Sales2", [three.id])

        expect(await render(world, TEMPLATE, { sentByUserId: none.id })).toBe(
          "[Zed]/[]",
        )
        expect(await render(world, TEMPLATE, { sentByUserId: one.id })).toBe(
          "[Grace]/[Sales]",
        )
        expect(await render(world, TEMPLATE, { sentByUserId: three.id })).toBe(
          "[Linus]/[Billing, Sales2, Support]",
        )
      })

      test("no sender (public API or an old job) renders both blank", async () => {
        const world = await buildWorld()
        expect(await render(world, TEMPLATE)).toBe("[]/[]")
      })

      test("teams of another workspace are excluded", async () => {
        const mine = await buildWorld()
        const theirs = await buildWorld()
        const member = await seedAgent(mine.workspaceId, "Grace")
        await seedTeam(mine.workspaceId, "Sales", [member.id])
        await seedTeam(theirs.workspaceId, "Secret", [member.id])
        expect(await render(mine, TEMPLATE, { sentByUserId: member.id })).toBe(
          "[Grace]/[Sales]",
        )
      })

      test("a user who is not a workspace member has no name; a blank name renders blank", async () => {
        const world = await buildWorld()
        const outsider = await seedUser("Outsider")
        const unnamed = await seedAgent(world.workspaceId, null)
        await seedTeam(world.workspaceId, "Sales", [unnamed.id])
        expect(
          await render(world, TEMPLATE, { sentByUserId: outsider.id }),
        ).toBe("[]/[]")
        expect(
          await render(world, TEMPLATE, { sentByUserId: unnamed.id }),
        ).toBe("[]/[Sales]")
      })
    })

    describe("last_text_input", () => {
      const TEMPLATE = "[{{last_text_input}}]"

      test("renders the latest incoming plain text", async () => {
        const world = await buildWorld()
        await seedMessage({
          workspaceId: world.workspaceId,
          conversationId: world.contact.conversationId,
          contactInboxId: world.contact.contactInboxId,
          direction: "incoming",
          text: "Hello",
          createdAt: new Date(Date.now() - 60_000),
        })
        expect(await render(world, TEMPLATE)).toBe("[Hello]")
      })

      test("a newer outgoing message does not hide the contact's text", async () => {
        const world = await buildWorld()
        await seedMessage({
          workspaceId: world.workspaceId,
          conversationId: world.contact.conversationId,
          contactInboxId: world.contact.contactInboxId,
          direction: "incoming",
          text: "Hello",
          createdAt: new Date(Date.now() - 120_000),
        })
        await seedMessage({
          workspaceId: world.workspaceId,
          conversationId: world.contact.conversationId,
          contactInboxId: world.contact.contactInboxId,
          direction: "outgoing",
          text: "Agent reply",
          createdAt: new Date(Date.now() - 60_000),
        })
        expect(await render(world, TEMPLATE)).toBe("[Hello]")
      })

      test("a latest incoming attachment resolves blank (never a media URL)", async () => {
        const world = await buildWorld()
        await seedMessage({
          workspaceId: world.workspaceId,
          conversationId: world.contact.conversationId,
          contactInboxId: world.contact.contactInboxId,
          direction: "incoming",
          text: "Hello",
          createdAt: new Date(Date.now() - 120_000),
        })
        await seedMessage({
          workspaceId: world.workspaceId,
          conversationId: world.contact.conversationId,
          contactInboxId: world.contact.contactInboxId,
          direction: "incoming",
          text: "caption",
          createdAt: new Date(Date.now() - 60_000),
          attachment: { fileType: "image", originPath: "public/e2e/photo.png" },
        })
        expect(await render(world, TEMPLATE)).toBe("[]")
      })

      test("no messages, and another contact's messages, render blank", async () => {
        const mine = await buildWorld()
        const theirs = await buildWorld()
        await seedMessage({
          workspaceId: theirs.workspaceId,
          conversationId: theirs.contact.conversationId,
          contactInboxId: theirs.contact.contactInboxId,
          direction: "incoming",
          text: "Not yours",
          createdAt: new Date(Date.now() - 60_000),
        })
        expect(await render(mine, TEMPLATE)).toBe("[]")
      })
    })

    describe("empty and key aliases", () => {
      test("{{empty}} renders an empty string", async () => {
        const world = await buildWorld()
        expect(await render(world, "A{{empty}}B")).toBe("AB")
      })

      test("last_btt_title is last_btn_title", async () => {
        const world = await buildWorld()
        await db
          .update(contactInboxModel)
          .set({ lastBtnTitle: "Choose plan" })
          .where(eq(contactInboxModel.id, world.contact.contactInboxId))
        expect(
          await render(world, "[{{last_btt_title}}]/[{{last_btn_title}}]"),
        ).toBe("[Choose plan]/[Choose plan]")
      })

      test("page_api_key and api_key resolve one minted default token per workspace", async () => {
        const mine = await buildWorld()
        const theirs = await buildWorld()
        const text = "[{{page_api_key}}]/[{{api_key}}]"

        const mineRendered = await render(mine, text)
        const theirsRendered = await render(theirs, text)

        const [left, right] = mineRendered.slice(1, -1).split("]/[")
        expect(left).toBeTruthy()
        expect(left).toBe(right)
        const [theirLeft, theirRight] = theirsRendered.slice(1, -1).split("]/[")
        expect(theirLeft).toBeTruthy()
        expect(theirLeft).toBe(theirRight)
        expect(theirLeft).not.toBe(left)
        const defaults = await db.query.workspaceApiTokenModel.findMany({
          where: { workspaceId: mine.workspaceId, isDefault: true },
        })
        expect(defaults).toHaveLength(1)
        // Rendering again reuses the same token instead of minting another.
        expect(await render(mine, text)).toBe(mineRendered)
        expect(
          await db.query.workspaceApiTokenModel.findMany({
            where: { workspaceId: mine.workspaceId },
          }),
        ).toHaveLength(1)
      })

      test("a workspace scheduled for deletion exposes no key", async () => {
        const world = await buildWorld()
        await db
          .update(workspaceModel)
          .set({ scheduledDeletionAt: new Date(Date.now() + 86_400_000) })
          .where(eq(workspaceModel.id, world.workspaceId))
        expect(await render(world, "[{{page_api_key}}]/[{{api_key}}]")).toBe(
          "[]/[]",
        )
        expect(
          await db.query.workspaceApiTokenModel.findMany({
            where: { workspaceId: world.workspaceId },
          }),
        ).toHaveLength(0)
      })
    })
  },
)
