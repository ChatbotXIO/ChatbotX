import { createHmac } from "node:crypto"
import { db } from "@chatbotx.io/database/client"
import { integration as instagramIntegration } from "@chatbotx.io/integration-instagram"
import type { IntegrationJobReceiveMessage } from "@chatbotx.io/worker-config"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  assertThrowawayDatabase,
  closeDatabase,
  hasThrowawayDatabase,
} from "./support/real-database"
import { renderForContact } from "./support/render"
import {
  numericId,
  seedContact,
  seedInstagramChannel,
  seedWorkspace,
} from "./support/seed"

const CLIENT_SECRET = "e2e-secret"
const STORY_TEMPLATE = "[{{last_story_id}}]"

type MessageBody = {
  mid: string
  text?: string
  is_echo?: boolean
  reply_to?: { story?: { id?: unknown; url?: string }; mid?: string }
  attachments?: { type: string; payload: { url: string } }[]
}

type World = Awaited<ReturnType<typeof buildWorld>>

const buildWorld = async () => {
  const { workspace } = await seedWorkspace()
  const igId = numericId()
  const channel = await seedInstagramChannel(workspace.id, igId)
  const psid = numericId()
  const contact = await seedContact({
    workspaceId: workspace.id,
    inboxId: channel.inboxId,
    channel: "instagram",
    sourceId: psid,
  })
  return { workspaceId: workspace.id, igId, psid, contact }
}

/** A signed Instagram messaging webhook through the real handler. */
const deliver = async (
  world: World,
  message: MessageBody,
  options: { echo?: boolean; timestamp?: number } = {},
): Promise<IntegrationJobReceiveMessage["data"][]> => {
  const sender = options.echo ? world.igId : world.psid
  const recipient = options.echo ? world.psid : world.igId
  const body = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: world.igId,
        time: 1_792_751_096_000,
        messaging: [
          {
            sender: { id: sender },
            recipient: { id: recipient },
            timestamp: options.timestamp ?? Date.now(),
            message: options.echo ? { ...message, is_echo: true } : message,
          },
        ],
      },
    ],
  })
  const signature = `sha256=${createHmac("sha256", CLIENT_SECRET).update(body).digest("hex")}`
  const queued: IntegrationJobReceiveMessage["data"][] = []
  const queue = {
    add: (name: string, job: { data: unknown }) => {
      if (name === "incomingMessage") {
        queued.push(job.data as IntegrationJobReceiveMessage["data"])
      }
      return Promise.resolve()
    },
  }

  await instagramIntegration.handleRequest({
    config: { clientSecret: CLIENT_SECRET, verifyToken: "verify" },
    req: new Request(
      "https://example.test/api/integrations/instagram/webhook",
      {
        method: "POST",
        headers: { "x-hub-signature-256": signature },
        body,
      },
    ),
    queue,
  } as never)

  return queued
}

/** The webhook, then the real worker `receiveMessage` on the queued job. */
const receive = async (
  world: World,
  message: MessageBody,
  options: { echo?: boolean; timestamp?: number } = {},
) => {
  const { receiveMessage } = await import(
    "../../src/integration/handlers/received-message"
  )
  const jobs = await deliver(world, message, options)
  expect(jobs).toHaveLength(1)
  const [job] = jobs
  if (!job) {
    throw new Error("the webhook queued no incomingMessage job")
  }
  return await receiveMessage(job)
}

const storyReply = (storyId: string, mid = `ig.mid.${numericId()}`) =>
  ({
    mid,
    text: "Story reply",
    reply_to: { story: { id: storyId, url: "https://example.test/story" } },
  }) satisfies MessageBody

const contactInbox = (world: World) =>
  db.query.contactInboxModel.findFirst({
    where: { id: world.contact.contactInboxId },
  })

const messages = (world: World) =>
  db.query.messageModel.findMany({
    where: { contactInboxId: world.contact.contactInboxId },
  })

const render = (world: World) =>
  renderForContact({
    contactId: world.contact.contactId,
    contactInboxId: world.contact.contactInboxId,
    text: STORY_TEMPLATE,
  })

describe.skipIf(!hasThrowawayDatabase())(
  "Instagram story reply: signed webhook to stored story id to rendered variable",
  () => {
    beforeAll(assertThrowawayDatabase)
    afterAll(closeDatabase)

    test("a story reply stores the story on the message and on the contact inbox", async () => {
      const world = await buildWorld()

      const result = await receive(world, storyReply("8101"))

      expect(result?.message?.contentAttributes).toMatchObject({
        type: "story_reply",
        story: { id: "8101", url: "https://example.test/story" },
      })
      expect((await contactInbox(world))?.lastStoryId).toBe("8101")
      expect(await render(world)).toBe("[8101]")
    })

    test("a later story reply replaces the stored id", async () => {
      const world = await buildWorld()

      await receive(world, storyReply("8101"))
      await receive(world, storyReply("8102"))

      expect((await contactInbox(world))?.lastStoryId).toBe("8102")
      expect(await render(world)).toBe("[8102]")
    })

    test("an ordinary message, a DM reply and a story mention keep the stored id", async () => {
      const world = await buildWorld()
      await receive(world, storyReply("8101"))

      await receive(world, { mid: `ig.mid.${numericId()}`, text: "Plain" })
      await receive(world, {
        mid: `ig.mid.${numericId()}`,
        text: "Reply to a DM",
        reply_to: { mid: "some.dm" },
      })
      await receive(world, {
        mid: `ig.mid.${numericId()}`,
        attachments: [
          {
            type: "story_mention",
            payload: { url: "https://example.test/mention.jpg" },
          },
        ],
      })

      expect((await contactInbox(world))?.lastStoryId).toBe("8101")
      expect(await render(world)).toBe("[8101]")
    })

    test("an outgoing echo of a story reply never overwrites the contact's story", async () => {
      const world = await buildWorld()
      await receive(world, storyReply("8101"))

      await receive(world, storyReply("8102"), { echo: true })

      // The echo is stored as an outgoing message but leaves tracking alone.
      const stored = await messages(world)
      expect(stored).toHaveLength(2)
      expect(stored.filter((m) => m.messageType === "outgoing")).toHaveLength(1)
      expect((await contactInbox(world))?.lastStoryId).toBe("8101")
      expect(await render(world)).toBe("[8101]")
    })

    test("replaying the same message id changes nothing", async () => {
      const world = await buildWorld()
      const first = storyReply("8101", "ig.mid.replayed")
      await receive(world, first)
      await receive(world, storyReply("8102"))

      await receive(world, first)

      // The replay is deduplicated: no third row, story not moved back to 8101.
      expect(await messages(world)).toHaveLength(2)
      expect((await contactInbox(world))?.lastStoryId).toBe("8102")
    })

    test("a story reply whose id is empty must not erase the stored story", async () => {
      const world = await buildWorld()
      await receive(world, storyReply("8101"))

      await receive(world, storyReply(""))

      expect((await contactInbox(world))?.lastStoryId).toBe("8101")
      expect(await render(world)).toBe("[8101]")
    })

    test("a story reply whose id has the wrong type is rejected and changes nothing", async () => {
      const world = await buildWorld()
      await receive(world, storyReply("8101"))
      const { receiveMessage } = await import(
        "../../src/integration/handlers/received-message"
      )
      const jobs = await deliver(world, {
        mid: `ig.mid.${numericId()}`,
        text: "Bad story",
        reply_to: { story: { id: 8102 as unknown } },
      })

      // The webhook's schema drops it: nothing is queued, nothing is stored.
      expect(jobs).toHaveLength(0)
      for (const job of jobs) {
        await receiveMessage(job)
      }

      expect(await messages(world)).toHaveLength(1)
      expect((await contactInbox(world))?.lastStoryId).toBe("8101")
    })

    test("a story reply of one contact never touches another contact", async () => {
      const mine = await buildWorld()
      const theirs = await buildWorld()

      await receive(mine, storyReply("8101"))

      expect((await contactInbox(theirs))?.lastStoryId).toBeNull()
      expect(await render(theirs)).toBe("[]")
    })

    test("a contact who never replied to a story renders blank", async () => {
      const world = await buildWorld()
      await receive(world, { mid: `ig.mid.${numericId()}`, text: "Hi" })
      expect((await contactInbox(world))?.lastStoryId).toBeNull()
      expect(await render(world)).toBe("[]")
    })
  },
)
