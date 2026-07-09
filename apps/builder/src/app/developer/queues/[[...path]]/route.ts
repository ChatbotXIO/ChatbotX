import { createBullBoard } from "@bull-board/api"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { HonoAdapter } from "@bull-board/hono"
import { isSuperAdmin } from "@chatbotx.io/business"
import {
  aiAgentQueue,
  chatQueue,
  defaultQueue,
  getSequenceSchedulerQueue,
  integrationQueue,
  quotaQueue,
  scheduleQueue,
  triggerQueue,
  webhookQueue,
} from "@chatbotx.io/worker-config"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { handle } from "hono/vercel"
import { getCurrentUser } from "@/lib/auth/utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const basePath = "/developer/queues"

type BullBoardQueueLike = {
  add: (...args: unknown[]) => Promise<string>
  addBulk: (...args: unknown[]) => Promise<string>
  name: string
  opts: unknown
  client: unknown
}

function isBullBoardQueue(queue: unknown): queue is BullBoardQueueLike {
  return (
    typeof queue === "object" &&
    queue !== null &&
    "add" in queue &&
    "addBulk" in queue &&
    "name" in queue &&
    "opts" in queue &&
    "client" in queue
  )
}

async function buildApp() {
  const sequenceSchedulerQueue = await getSequenceSchedulerQueue()
  const queues = [
    chatQueue,
    aiAgentQueue,
    triggerQueue,
    webhookQueue,
    defaultQueue,
    integrationQueue,
    quotaQueue,
    scheduleQueue,
    ...(sequenceSchedulerQueue ? [sequenceSchedulerQueue] : []),
  ].filter(isBullBoardQueue)

  const serverAdapter = new HonoAdapter(serveStatic)
  serverAdapter.setBasePath(basePath)

  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue as never)),
    serverAdapter,
    options: { uiBasePath: "node_modules/@bull-board/ui" },
  })

  const app = new Hono()
  app.route(basePath, serverAdapter.registerPlugin())
  return app
}

async function handler(request: Request) {
  const user = await getCurrentUser()
  if (!(user && isSuperAdmin(user))) {
    return new Response("Not found", { status: 404 })
  }

  const app = await buildApp()
  return handle(app)(request)
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
