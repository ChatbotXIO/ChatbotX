import { db, eq } from "@chatbotx.io/database/client"
import {
  contactInboxModel,
  flowModel,
  flowVersionModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { chatQueue, integrationQueue } from "@chatbotx.io/worker-config"
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

type SentJob = {
  type: string
  data: { sentByUserId?: string; step?: { id: string } }
}

const buildWorld = async () => {
  const { workspace } = await seedWorkspace()
  const channel = await seedMessengerChannel(workspace.id, numericId())
  const contact = await seedContact({
    workspaceId: workspace.id,
    inboxId: channel.inboxId,
    channel: "messenger",
    sourceId: numericId(),
  })
  await db
    .update(contactInboxModel)
    .set({ lastIncomingMessageAt: new Date() })
    .where(eq(contactInboxModel.id, contact.contactInboxId))

  // A real published flow: one start node with two text steps.
  const flowId = createId()
  const versionId = createId()
  const nodeId = createId()
  await db
    .insert(flowModel)
    .values({ id: flowId, name: "E2E flow", workspaceId: workspace.id })
  await db.insert(flowVersionModel).values({
    id: versionId,
    workspaceId: workspace.id,
    flowId,
    isDraft: false,
    isLatest: true,
    startNodeId: nodeId,
    edges: [],
    nodes: [
      {
        id: nodeId,
        type: "node",
        position: { x: 0, y: 0 },
        data: {
          isStartNode: true,
          details: {
            id: createId(),
            beforeStep: null,
            quickReplies: [],
            steps: [1, 2].map(() => ({
              id: createId(),
              stepType: "sendText",
              text: TEXT,
              buttons: [],
              states: [],
            })),
          },
        },
      },
    ],
  })
  await db
    .update(flowModel)
    .set({ currentVersionId: versionId })
    .where(eq(flowModel.id, flowId))
  return { workspaceId: workspace.id, contact, flowId, nodeId }
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

const capture = (sent: SentJob[]) => {
  const record = (_name: unknown, job: unknown) => {
    sent.push(job as SentJob)
    return Promise.resolve({ id: `job.${sent.length}` } as never)
  }
  vi.spyOn(chatQueue, "add").mockImplementation(record)
  vi.spyOn(integrationQueue, "add").mockImplementation(record)
}

/**
 * Runs the real flow engine and drains the queue like the workers do: every
 * `sendFlow` continuation goes back into `runFlowNode`, every
 * `sendFlowMessage` into `sendFlowStep`. All jobs seen are returned.
 */
const runFlow = async (world: World, sentByUserId?: string) => {
  const seen: SentJob[] = []
  capture(seen)
  const { runFlowNode } = await import("../../src/integration/handlers/flow")
  const { sendFlowStep } = await import(
    "../../src/chat/handlers/send-flow-step"
  )

  await runFlowNode(
    {
      conversationId: world.contact.conversationId,
      contactInboxId: world.contact.contactInboxId,
      flowId: world.flowId,
      nodeId: world.nodeId,
      sendFrom: "inbox",
      sentByUserId,
    } as never,
    { flowExecutionKey: `e2e.${createId()}` },
  )

  const guard = 20
  for (let index = 0; index < seen.length && index < guard; index++) {
    const job = seen[index]
    if (job?.type === "sendFlowMessage") {
      await sendFlowStep(job.data as never)
    } else if (job?.type === "sendFlow") {
      await runFlowNode(job.data as never, {
        flowExecutionKey: `e2e.${createId()}`,
      })
    }
  }
  return seen
}

describe.skipIf(!hasThrowawayDatabase())(
  "real flow engine: sender survives runFlowNode to the delivered message",
  () => {
    beforeAll(assertThrowawayDatabase)
    afterAll(closeDatabase)
    beforeEach(() => {
      vi.restoreAllMocks()
      graph.sendMessage.mockReset()
      graph.sendMessage.mockImplementation(() =>
        Promise.resolve({
          recipient_id: "recipient",
          message_id: `mid.${numericId()}`,
        }),
      )
    })

    test("every job of the chain carries the agent and the delivered texts show their name and teams", async () => {
      const world = await buildWorld()
      const grace = await seedAgent(world.workspaceId, "Grace")
      await seedTeam(world.workspaceId, "Sales", [grace.id])
      await seedTeam(world.workspaceId, "Billing", [grace.id])

      const jobs = await runFlow(world, grace.id)

      const steps = jobs.filter((job) => job.type === "sendFlowMessage")
      expect(steps).toHaveLength(2)
      expect(jobs.length).toBeGreaterThanOrEqual(2)
      expect(jobs.map((job) => job.data.sentByUserId)).toEqual(
        jobs.map(() => grace.id),
      )
      expect(await outgoingTexts(world)).toEqual([
        "[Grace]/[Billing, Sales]",
        "[Grace]/[Billing, Sales]",
      ])
    })

    test("a flow started without an agent carries none and delivers blanks", async () => {
      const world = await buildWorld()

      const jobs = await runFlow(world)

      expect(jobs.filter((job) => job.type === "sendFlowMessage")).toHaveLength(
        2,
      )
      expect(jobs.every((job) => job.data.sentByUserId === undefined)).toBe(
        true,
      )
      expect(await outgoingTexts(world)).toEqual(["[]/[]", "[]/[]"])
    })
  },
)
