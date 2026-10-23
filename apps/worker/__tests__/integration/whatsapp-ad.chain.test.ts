import { createHmac } from "node:crypto"
import { db } from "@chatbotx.io/database/client"
import { integration as whatsappIntegration } from "@chatbotx.io/integration-whatsapp"
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
  seedWhatsappChannel,
  seedWorkspace,
} from "./support/seed"

const CLIENT_SECRET = "e2e-secret"
const AD_TEMPLATE =
  "[{{last_ad_headline}}]/[{{last_ad_body}}]/[{{last_ad}}]/[{{last_ctwa}}]"

type Referral = Record<string, unknown>

type World = Awaited<ReturnType<typeof buildWorld>>

const buildWorld = async () => {
  const { workspace } = await seedWorkspace()
  const phoneNumberId = numericId()
  const channel = await seedWhatsappChannel(workspace.id, phoneNumberId)
  const waId = numericId()
  const contact = await seedContact({
    workspaceId: workspace.id,
    inboxId: channel.inboxId,
    channel: "whatsapp",
    sourceId: waId,
  })
  return { workspaceId: workspace.id, phoneNumberId, waId, contact }
}

/** A signed WhatsApp Cloud API webhook through the real handler. */
const deliver = async (
  world: World,
  message: { id: string; text: string; referral?: Referral },
): Promise<IntegrationJobReceiveMessage["data"][]> => {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: `waba-${world.phoneNumberId}`,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550001111",
                phone_number_id: world.phoneNumberId,
              },
              contacts: [{ profile: { name: "Ada" }, wa_id: world.waId }],
              messages: [
                {
                  from: world.waId,
                  id: message.id,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: message.text },
                  ...(message.referral ? { referral: message.referral } : {}),
                },
              ],
            },
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

  await whatsappIntegration.handleRequest({
    config: { clientSecret: CLIENT_SECRET, verifyToken: "verify" },
    req: new Request("https://example.test/api/integrations/whatsapp/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": signature },
      body,
    }),
    queue,
  } as never)

  return queued
}

const receive = async (
  world: World,
  message: { id?: string; text?: string; referral?: Referral },
) => {
  const { receiveMessage } = await import(
    "../../src/integration/handlers/received-message"
  )
  const jobs = await deliver(world, {
    id: message.id ?? `wamid.${numericId()}`,
    text: message.text ?? "Hello",
    referral: message.referral,
  })
  expect(jobs).toHaveLength(1)
  const [job] = jobs
  if (!job) {
    throw new Error("the webhook queued no incomingMessage job")
  }
  return await receiveMessage(job)
}

const adReferral = (overrides: Referral = {}): Referral => ({
  source_id: "6201",
  source_type: "ad",
  source_url: "https://fb.me/example",
  headline: "Headline A",
  body: "Body A",
  ctwa_clid: "click-1",
  ...overrides,
})

const referralOf = async (world: World) =>
  (
    await db.query.contactInboxModel.findFirst({
      where: { id: world.contact.contactInboxId },
    })
  )?.referral

const messageCount = async (world: World) =>
  (
    await db.query.messageModel.findMany({
      where: { contactInboxId: world.contact.contactInboxId },
    })
  ).length

const render = (world: World) =>
  renderForContact({
    contactId: world.contact.contactId,
    contactInboxId: world.contact.contactInboxId,
    text: AD_TEMPLATE,
  })

describe.skipIf(!hasThrowawayDatabase())(
  "WhatsApp Click-to-WhatsApp ad: signed webhook to stored referral to rendered variables",
  () => {
    beforeAll(assertThrowawayDatabase)
    afterAll(closeDatabase)

    test("stores the ad headline, body, id and click id on the contact inbox", async () => {
      const world = await buildWorld()

      await receive(world, { referral: adReferral() })

      expect(await referralOf(world)).toMatchObject({
        adId: "6201",
        adTitle: "Headline A",
        adBody: "Body A",
        ctwaClid: "click-1",
        sourcePlatform: "facebook",
      })
      expect(await render(world)).toBe("[Headline A]/[Body A]/[6201]/[click-1]")
    })

    test("a plain message after the ad keeps the stored ad", async () => {
      const world = await buildWorld()
      await receive(world, { referral: adReferral() })

      await receive(world, { text: "Follow-up" })

      expect(await render(world)).toBe("[Headline A]/[Body A]/[6201]/[click-1]")
    })

    test("an ad without a body renders that field blank", async () => {
      const world = await buildWorld()

      await receive(world, {
        referral: adReferral({ body: undefined, headline: "Only headline" }),
      })

      expect(await render(world)).toBe("[Only headline]/[]/[6201]/[click-1]")
    })

    test("a NEWER ad that carries no body must not inherit the previous ad's body", async () => {
      const world = await buildWorld()
      await receive(world, { referral: adReferral() })

      await receive(world, {
        referral: {
          source_id: "6202",
          source_type: "ad",
          source_url: "https://fb.me/example-b",
          headline: "Headline B",
          ctwa_clid: "click-2",
        },
      })

      expect(await render(world)).toBe("[Headline B]/[]/[6202]/[click-2]")
    })

    test("a NEWER ad that carries no headline must not inherit the previous ad's headline", async () => {
      const world = await buildWorld()
      await receive(world, { referral: adReferral() })

      await receive(world, {
        referral: {
          source_id: "6203",
          source_type: "ad",
          source_url: "https://fb.me/example-c",
          body: "Body C",
          ctwa_clid: "click-3",
        },
      })

      expect(await render(world)).toBe("[]/[Body C]/[6203]/[click-3]")
    })

    test("replaying the same message id changes nothing", async () => {
      const world = await buildWorld()
      await receive(world, { id: "wamid.replayed", referral: adReferral() })
      await receive(world, {
        referral: adReferral({
          source_id: "6204",
          headline: "Headline D",
          body: "Body D",
          ctwa_clid: "click-4",
        }),
      })

      await receive(world, { id: "wamid.replayed", referral: adReferral() })

      expect(await messageCount(world)).toBe(2)
      expect(await render(world)).toBe("[Headline D]/[Body D]/[6204]/[click-4]")
    })

    test("an ad of one contact never touches another contact", async () => {
      const mine = await buildWorld()
      const theirs = await buildWorld()

      await receive(mine, { referral: adReferral() })

      expect(await render(theirs)).toBe("[]/[]/[]/[]")
    })

    test("a contact who never came from an ad renders blank", async () => {
      const world = await buildWorld()
      await receive(world, { text: "Hi" })
      expect(await render(world)).toBe("[]/[]/[]/[]")
    })
  },
)
