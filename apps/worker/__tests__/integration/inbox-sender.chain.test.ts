import { messageService } from "@chatbotx.io/business"
import { db, eq } from "@chatbotx.io/database/client"
import { contactInboxModel, flowModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { integrationQueue } from "@chatbotx.io/worker-config"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import {
  assertThrowawayDatabase,
  closeDatabase,
  hasThrowawayDatabase,
} from "./support/real-database"
import {
  numericId,
  seedAgent,
  seedContact,
  seedMessengerChannel,
  seedTeam,
  seedWorkspace,
} from "./support/seed"

// Only the outbound Graph call is stubbed (and captured): createOutgoing, the
// worker's sendFlowStep, variable resolution and message persistence are real.
const graph = vi.hoisted(() => ({ sendMessage: vi.fn() }))
vi.mock(
  "@chatbotx.io/integration-messenger/apis/message",
  async (original) => ({
    ...(await original<
      typeof import("@chatbotx.io/integration-messenger/apis/message")
    >()),
    sendMessage: graph.sendMessage,
  }),
)

const TEXT = "[{{admin_name}}]/[{{admin_team_name}}]"

const buildWorld = async () => {
  const { workspace } = await seedWorkspace()
  const channel = await seedMessengerChannel(workspace.id, numericId())
  const psid = numericId()
  const contact = await seedContact({
    workspaceId: workspace.id,
    inboxId: channel.inboxId,
    channel: "messenger",
    sourceId: psid,
  })
  // Inside the 24h messaging window.
  await db
    .update(contactInboxModel)
    .set({ lastIncomingMessageAt: new Date() })
    .where(eq(contactInboxModel.id, contact.contactInboxId))
  const flowId = createId()
  await db
    .insert(flowModel)
    .values({ id: flowId, name: "E2E flow", workspaceId: workspace.id })
  return { workspaceId: workspace.id, psid, contact, flowId }
}

type World = Awaited<ReturnType<typeof buildWorld>>

const outgoingTexts = async (world: World) =>
  (
    await db.query.messageModel.findMany({
      where: {
        conversationId: world.contact.conversationId,
        messageType: "outgoing",
      },
      orderBy: { createdAt: "asc" },
    })
  ).map((message) => message.text)

/** What the inbox does when an agent picks a flow: the real createOutgoing. */
const sendFlowFromInbox = async (world: World, userId: string | null) => {
  const addJob = vi
    .spyOn(integrationQueue, "add")
    .mockResolvedValue(undefined as never)
  const conversation = await db.query.conversationModel.findFirst({
    where: { id: world.contact.conversationId },
  })
  const contactInbox = await db.query.contactInboxModel.findFirst({
    where: { id: world.contact.contactInboxId },
  })
  const user = userId
    ? await db.query.userModel.findFirst({ where: { id: userId } })
    : undefined
  if (!(conversation && contactInbox)) {
    throw new Error("seed missing")
  }

  await messageService.createOutgoing({
    conversation,
    contactInbox,
    input: { flowId: world.flowId, nodeId: "start" } as never,
    user,
  })

  const [, job] = addJob.mock.calls[0] as unknown as [
    string,
    { data: { sentByUserId?: string; sendFrom?: string } },
  ]
  return job.data
}

/** The chat worker step that renders and delivers the flow's text message. */
const deliverStep = async (world: World, sentByUserId?: string) => {
  const { sendFlowStep } = await import(
    "../../src/chat/handlers/send-flow-step"
  )
  await sendFlowStep({
    conversationId: world.contact.conversationId,
    contactInboxId: world.contact.contactInboxId,
    flowId: world.flowId,
    step: {
      id: createId(),
      nodeId: "start",
      stepType: "sendText",
      text: TEXT,
      buttons: [],
    },
    sentByUserId,
  } as never)
}

describe.skipIf(!hasThrowawayDatabase())(
  "inbox sends a flow: sender reaches the delivered message",
  () => {
    beforeAll(assertThrowawayDatabase)
    afterAll(closeDatabase)
    beforeEach(() => {
      graph.sendMessage.mockReset()
      graph.sendMessage.mockImplementation((_auth: unknown, payload: unknown) =>
        Promise.resolve({
          recipient_id: "recipient",
          message_id: `mid.${numericId()}`,
          payload,
        }),
      )
    })

    test("createOutgoing marks the job with the agent; the delivered text carries their name and teams", async () => {
      const world = await buildWorld()
      const grace = await seedAgent(world.workspaceId, "Grace")
      await seedTeam(world.workspaceId, "Sales", [grace.id])
      await seedTeam(world.workspaceId, "Billing", [grace.id])

      const job = await sendFlowFromInbox(world, grace.id)
      expect(job).toMatchObject({ sendFrom: "inbox", sentByUserId: grace.id })

      await deliverStep(world, job.sentByUserId)

      expect(await outgoingTexts(world)).toEqual(["[Grace]/[Billing, Sales]"])
      const sent = graph.sendMessage.mock.calls[0]?.[1] as {
        message?: { text?: string }
      }
      expect(sent.message?.text).toBe("[Grace]/[Billing, Sales]")
    })

    test("a flow sent without a user (public API) marks no sender and delivers blanks", async () => {
      const world = await buildWorld()

      const job = await sendFlowFromInbox(world, null)
      expect(job.sentByUserId).toBeUndefined()

      await deliverStep(world, job.sentByUserId)

      expect(await outgoingTexts(world)).toEqual(["[]/[]"])
    })

    test("two agents in the same workspace each see their own name", async () => {
      const world = await buildWorld()
      const ada = await seedAgent(world.workspaceId, "Ada")
      const linus = await seedAgent(world.workspaceId, "Linus")
      await seedTeam(world.workspaceId, "Support", [linus.id])

      await deliverStep(world, ada.id)
      await deliverStep(world, linus.id)

      expect(await outgoingTexts(world)).toEqual([
        "[Ada]/[]",
        "[Linus]/[Support]",
      ])
    })
  },
)
