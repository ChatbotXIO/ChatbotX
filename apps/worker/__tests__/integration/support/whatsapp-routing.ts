import { createHmac } from "node:crypto"
import { messageService, threadControlService } from "@chatbotx.io/business"
import { db, eq } from "@chatbotx.io/database/client"
import type {
  ThreadControlAction,
  ThreadControlRole,
} from "@chatbotx.io/database/partials"
import { contactInboxModel, inboxModel } from "@chatbotx.io/database/schema"
import { integration as whatsappIntegration } from "@chatbotx.io/integration-whatsapp"
import { chatQueue } from "@chatbotx.io/worker-config"
import { vi } from "vitest"
import {
  numericId,
  seedContact,
  seedWhatsappChannel,
  seedWorkspace,
} from "./seed"

/**
 * Fake-webhook harness for WhatsApp Conversation Routing: signed webhooks go
 * through the real WhatsApp handler, the queued jobs run through the real
 * worker handlers against the throwaway database, and only the HTTP calls to
 * the Graph API are intercepted (recorded, answered by a scripted responder).
 */

const CLIENT_SECRET = "e2e-secret"
const GRAPH_HOST = "graph.facebook.com"

export type GraphCall = { url: string; method: string; body: unknown }
export type GraphError = { code: number; message?: string; type?: string }

const graph = {
  calls: [] as GraphCall[],
  /** Errors to return, matched in order, for URLs ending with the key. */
  failNext: new Map<string, GraphError[]>(),
  /** Fixed success bodies for URLs ending with the key. */
  bodies: new Map<string, unknown>(),
  counter: 0,
}

const realFetch = globalThis.fetch

const readBody = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<unknown> => {
  const raw =
    init?.body ??
    (input instanceof Request ? await input.clone().text() : undefined)
  if (typeof raw !== "string") {
    return raw ?? null
  }
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const fakeGraph = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const url =
    input instanceof Request ? input.url : new URL(String(input)).toString()
  if (!url.includes(GRAPH_HOST)) {
    return realFetch(input, init)
  }
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase()
  const body = await readBody(input, init)
  graph.calls.push({ url, method, body })
  graph.counter += 1

  const path = new URL(url).pathname
  for (const [suffix, queue] of graph.failNext) {
    if (path.endsWith(suffix) && queue.length > 0) {
      const error = queue.shift() as GraphError
      return json(400, {
        error: {
          message: error.message ?? `(#${error.code}) scripted error`,
          type: error.type ?? "OAuthException",
          code: error.code,
          fbtrace_id: `trace-${graph.counter}`,
        },
      })
    }
  }
  for (const [suffix, fixed] of graph.bodies) {
    if (path.endsWith(suffix)) {
      return json(200, fixed)
    }
  }
  if (path.endsWith("/thread_control")) {
    return json(200, { success: true, request_id: `req-${graph.counter}` })
  }
  if (path.endsWith("/messages")) {
    const to =
      body && typeof body === "object" && "to" in body
        ? String((body as { to: unknown }).to)
        : "0"
    return json(200, {
      messaging_product: "whatsapp",
      contacts: [{ input: to, wa_id: to }],
      messages: [{ id: `wamid.out.${graph.counter}` }],
    })
  }
  return json(200, {})
}

export const installGraphMock = (): void => {
  vi.stubGlobal("fetch", fakeGraph)
}

export const resetGraph = (): void => {
  graph.calls.length = 0
  graph.failNext.clear()
  graph.bodies.clear()
}

export const respondGraph = (pathSuffix: string, body: unknown): void => {
  graph.bodies.set(pathSuffix, body)
}

export const failGraphNext = (pathSuffix: string, error: GraphError): void => {
  const queue = graph.failNext.get(pathSuffix) ?? []
  queue.push(error)
  graph.failNext.set(pathSuffix, queue)
}

/** The JSON body of the most recent `thread_control` call. */
export const lastThreadControlBody = (): Record<string, unknown> => {
  const body = graphCalls("/thread_control").at(-1)?.body
  if (typeof body !== "object" || body === null) {
    throw new Error("No thread_control call was recorded")
  }
  return Object.fromEntries(Object.entries(body))
}

export const graphCalls = (pathSuffix?: string): GraphCall[] =>
  pathSuffix
    ? graph.calls.filter((call) =>
        new URL(call.url).pathname.endsWith(pathSuffix),
      )
    : [...graph.calls]

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

/**
 * `routingActive` (default): the number already saw routing traffic, as any
 * number with Conversation Routing configured in Meta does. `false`: a
 * single-partner number that never saw any.
 */
export const buildRoutingWorld = async (
  options: { routingActive?: boolean } = {},
) => {
  const { workspace } = await seedWorkspace()
  const phoneNumberId = numericId()
  const channel = await seedWhatsappChannel(workspace.id, phoneNumberId)
  if (options.routingActive !== false) {
    await db
      .update(inboxModel)
      .set({ threadControlSeenAt: new Date() })
      .where(eq(inboxModel.id, channel.inboxId))
  }
  const waId = numericId()
  const contact = await seedContact({
    workspaceId: workspace.id,
    inboxId: channel.inboxId,
    channel: "whatsapp",
    sourceId: waId,
  })
  return {
    workspaceId: workspace.id,
    inboxId: channel.inboxId,
    phoneNumberId,
    waId,
    contact,
  }
}
export type RoutingWorld = Awaited<ReturnType<typeof buildRoutingWorld>>

/**
 * Only `Date` is faked: every webhook and every action of ours advances the
 * clock by 2 s, so Meta timestamps and our own (stamped at "now") interleave in
 * exactly the order the scenario lists them.
 */
export const installClock = (): void => {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() })
}

export const tick = (): void => {
  vi.setSystemTime(Date.now() + 2000)
}

/** Meta-style second timestamp for an event happening now (after a tick). */
const nextTs = (): string => {
  tick()
  return String(Math.floor(Date.now() / 1000))
}

// ---------------------------------------------------------------------------
// Webhook payloads (shapes from Meta devdocs / partner guides)
// ---------------------------------------------------------------------------

const envelope = (world: RoutingWorld, field: string, value: unknown) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: `waba-${world.phoneNumberId}`,
      changes: [{ field, value }],
    },
  ],
})

const metadata = (world: RoutingWorld) => ({
  display_phone_number: "15550001111",
  phone_number_id: world.phoneNumberId,
})

const contacts = (world: RoutingWorld) => [
  { profile: { name: "Ada" }, wa_id: world.waId },
]

export type InboundMessage = Record<string, unknown>

export const textMessage = (
  world: RoutingWorld,
  text: string,
  extra: Record<string, unknown> = {},
): InboundMessage => ({
  from: world.waId,
  id: `wamid.in.${numericId()}`,
  timestamp: nextTs(),
  type: "text",
  text: { body: text },
  ...extra,
})

export const ownerDelivery = (
  world: RoutingWorld,
  message: InboundMessage,
  conversationContext?: unknown,
) =>
  envelope(world, "messages", {
    messaging_product: "whatsapp",
    metadata: metadata(world),
    contacts: contacts(world),
    messages: [message],
    ...(conversationContext
      ? { conversation_context: conversationContext }
      : {}),
  })

export const standbyMessages = (world: RoutingWorld, message: InboundMessage) =>
  envelope(world, "standby", {
    messaging_product: "whatsapp",
    metadata: metadata(world),
    standby: { contacts: contacts(world), messages: [message] },
  })

export const textEcho = (world: RoutingWorld, text: string) => ({
  id: `wamid.echo.${numericId()}`,
  timestamp: nextTs(),
  message: {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: world.waId,
    type: "text",
    text: { body: text },
  },
})

/** A template echo carries the sent values AND the definition (sibling). */
export const templateEcho = (world: RoutingWorld) => ({
  id: `wamid.echo.${numericId()}`,
  timestamp: nextTs(),
  message: {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: world.waId,
    type: "template",
    template: {
      name: "order_shipped",
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "#1234" },
            { type: "text", text: "Thursday" },
          ],
        },
      ],
    },
  },
  template: {
    id: 1_234_567_890,
    name: "order_shipped",
    components: [
      { type: "HEADER", format: "IMAGE" },
      {
        type: "BODY",
        text: "Order {{1}} has shipped. Expected delivery: {{2}}.",
      },
      {
        type: "BUTTONS",
        buttons: [{ type: "QUICK_REPLY", text: "Change delivery date" }],
      },
    ],
  },
})

export const standbyEchoes = (world: RoutingWorld, echo: unknown) =>
  envelope(world, "standby", {
    messaging_product: "whatsapp",
    metadata: metadata(world),
    standby: { message_echoes: [echo] },
  })

export const standbyStatuses = (world: RoutingWorld) =>
  envelope(world, "standby", {
    messaging_product: "whatsapp",
    metadata: metadata(world),
    standby: {
      statuses: [
        {
          id: `wamid.echo.${numericId()}`,
          status: "delivered",
          timestamp: nextTs(),
          recipient_id: world.waId,
        },
      ],
    },
  })

export const handover = (
  world: RoutingWorld,
  type: "control_passed" | "control_taken",
  payload: Record<string, unknown>,
  sender: Record<string, unknown> = { phone_number: world.waId },
) =>
  envelope(world, "messaging_handovers", {
    messaging_product: "whatsapp",
    recipient: {
      display_phone_number: "15550001111",
      phone_number_id: world.phoneNumberId,
    },
    sender,
    timestamp: nextTs(),
    type,
    [type]: payload,
  })

export const summaryContext = (text: string) => ({
  type: "summary",
  summary: { text },
})

// ---------------------------------------------------------------------------
// Delivery: signed POST through the real handler, then the real job handlers
// ---------------------------------------------------------------------------

type QueuedJob = { name: string; data: unknown; opts: { jobId?: string } }

export const postWebhook = async (
  body: unknown,
  options: { signature?: string | null } = {},
): Promise<{ jobs: QueuedJob[]; response: unknown }> => {
  const raw = JSON.stringify(body)
  const signature =
    options.signature === undefined
      ? `sha256=${createHmac("sha256", CLIENT_SECRET).update(raw).digest("hex")}`
      : options.signature
  const jobs: QueuedJob[] = []
  const queue = {
    add: (name: string, data: unknown, opts: { jobId?: string } = {}) => {
      jobs.push({ name, data, opts })
      return Promise.resolve()
    },
  }
  const headers: Record<string, string> = {}
  if (signature) {
    headers["x-hub-signature-256"] = signature
  }
  const response = await whatsappIntegration.handleRequest({
    config: { clientSecret: CLIENT_SECRET, verifyToken: "verify" },
    req: new Request("https://example.test/api/integrations/whatsapp/webhook", {
      method: "POST",
      headers,
      body: raw,
    }),
    queue,
  } as never)
  return { jobs, response }
}

export type ProcessedJob = {
  name: string
  received?: Awaited<
    ReturnType<
      typeof import("../../../src/integration/handlers/received-message").receiveMessage
    >
  >
}

/** Runs every queued job exactly like the integration worker would. */
export const runJobs = async (jobs: QueuedJob[]): Promise<ProcessedJob[]> => {
  const { receiveMessage } = await import(
    "../../../src/integration/handlers/received-message"
  )
  const { receiveThreadControlEvent } = await import(
    "../../../src/integration/handlers/thread-control"
  )
  const results: ProcessedJob[] = []
  for (const job of jobs) {
    const payload = job.data as { data: never }
    if (job.name === "incomingMessage") {
      results.push({
        name: job.name,
        received: await receiveMessage(payload.data),
      })
    } else if (job.name === "threadControlEvent") {
      await receiveThreadControlEvent(payload.data, {
        isRetry: false,
        jobId: job.opts.jobId,
      })
      results.push({ name: job.name })
    } else {
      results.push({ name: job.name })
    }
  }
  return results
}

export const deliver = async (body: unknown): Promise<ProcessedJob[]> => {
  const { jobs } = await postWebhook(body)
  return await runJobs(jobs)
}

// ---------------------------------------------------------------------------
// State + our own actions
// ---------------------------------------------------------------------------

export const stateOf = async (world: RoutingWorld) => {
  const current = await threadControlService.resolveCurrentState({
    workspaceId: world.workspaceId,
    contactInboxId: world.contact.contactInboxId,
  })
  const row = await db.query.contactInboxModel.findFirst({
    where: { id: world.contact.contactInboxId },
  })
  return {
    stored: row?.threadControlState ?? null,
    state: row?.threadControlState ? (current?.state ?? null) : null,
    ownerRole: current?.ownerRole ?? null,
    lastEvent: current?.lastEvent ?? null,
  }
}

export const setSourceUserId = async (world: RoutingWorld, userId: string) => {
  await db
    .update(contactInboxModel)
    .set({ sourceUserId: userId })
    .where(eq(contactInboxModel.id, world.contact.contactInboxId))
}

/** Our own take / pass / release through the real registry + WhatsApp handler. */
export const threadAction = async (
  world: RoutingWorld,
  action: ThreadControlAction,
  extra: { targetRole?: ThreadControlRole; metadata?: string } = {},
) => {
  const { requestThreadControlAction } = await import(
    "@chatbotx.io/channel-registry/thread-control"
  )
  tick()
  return await requestThreadControlAction({
    workspaceId: world.workspaceId,
    contactInboxId: world.contact.contactInboxId,
    conversationId: world.contact.conversationId,
    action,
    ...extra,
  })
}

/**
 * An agent's free-form reply from the inbox: the real `createOutgoing`, then
 * the queued `sendChannelMessage` job through the real chat handler.
 */
export const agentSend = async (
  world: RoutingWorld,
  text: string,
  options: {
    bypassThreadControlLock?: boolean
    /** A non-final BullMQ attempt: a rethrow here means "retry". */
    willRetryOnThrow?: boolean
  } = {},
) => {
  const { willRetryOnThrow = false, ...input } = options
  tick()
  const addJob = vi
    .spyOn(chatQueue, "add")
    .mockResolvedValue(undefined as never)
  let calls: unknown[][] = []
  try {
    const conversation = await db.query.conversationModel.findFirst({
      where: { id: world.contact.conversationId },
    })
    const contactInbox = await db.query.contactInboxModel.findFirst({
      where: { id: world.contact.contactInboxId },
    })
    if (!(conversation && contactInbox)) {
      throw new Error("seed missing")
    }
    await messageService.createOutgoing({
      conversation,
      contactInbox,
      input: { text, ...input },
    } as never)
  } finally {
    calls = [...addJob.mock.calls]
    addJob.mockRestore()
  }
  const sendJob = calls.find(([name]) => name === "sendChannelMessage")
  if (!sendJob) {
    throw new Error("createOutgoing queued no sendChannelMessage job")
  }
  const { sendMessageToChannel } = await import(
    "../../../src/chat/handlers/send-message"
  )
  const job = sendJob[1] as { data: never }
  try {
    const result = await sendMessageToChannel(job.data, 0, willRetryOnThrow)
    return { ok: true as const, result }
  } catch (error) {
    return { ok: false as const, error }
  }
}

export const messagesOf = async (world: RoutingWorld) =>
  await db.query.messageModel.findMany({
    where: { conversationId: world.contact.conversationId },
    orderBy: { createdAt: "asc" },
  })
