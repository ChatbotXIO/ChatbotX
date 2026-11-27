import { db, eq } from "@chatbotx.io/database/client"
import { resolveThreadTakePermission } from "@chatbotx.io/database/partials"
import {
  flowModel,
  integrationWhatsappModel,
} from "@chatbotx.io/database/schema"
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
  agentSend,
  buildRoutingWorld,
  deliver,
  failGraphNext,
  graphCalls,
  handover,
  installClock,
  installGraphMock,
  lastThreadControlBody,
  messagesOf,
  ownerDelivery,
  postWebhook,
  type RoutingWorld,
  resetGraph,
  respondGraph,
  runJobs,
  setSourceUserId,
  standbyEchoes,
  standbyMessages,
  standbyStatuses,
  stateOf,
  summaryContext,
  templateEcho,
  textEcho,
  textMessage,
  threadAction,
  tick,
} from "./support/whatsapp-routing"

/**
 * Meta "Conversation Orchestration — Partner Testing Scenario Guide"
 * (SC-1..SC-7, E-1..E-7) and "Partner Integration Guide" (T-1..T-7), replayed
 * as signed webhooks through the real handler and worker against a throwaway
 * database. Only the Graph API HTTP calls are faked. We play "Main BSP BM".
 */

const inbound = (world: RoutingWorld, text: string) =>
  deliver(ownerDelivery(world, textMessage(world, text)))

const standbyInbound = (world: RoutingWorld, text: string) =>
  deliver(standbyMessages(world, textMessage(world, text)))

const numericIdLike = (): string =>
  `84${Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, "0")}`

const contactInboxBySource = async (world: RoutingWorld, sourceId: string) =>
  await db.query.contactInboxModel.findFirst({
    where: { inboxId: world.inboxId, sourceId },
  })

/** We start as owner: the customer's first message routed to us. */
const ownedWorld = async () => {
  const world = await buildRoutingWorld()
  await inbound(world, "Hi")
  expect((await stateOf(world)).state).toBe("owned")
  return world
}

describe.skipIf(!hasThrowawayDatabase())(
  "WhatsApp Conversation Routing — Meta partner scenarios",
  () => {
    beforeAll(async () => {
      await assertThrowawayDatabase()
      installGraphMock()
      installClock()
    })
    afterAll(async () => {
      vi.useRealTimers()
      await closeDatabase()
    })
    beforeEach(resetGraph)

    // ---------------------------------------------------------------- T-*
    describe("Integration Guide acceptance (T-1..T-7)", () => {
      test("T-1a standby customer message: stored, no automation, thread standby", async () => {
        const world = await buildRoutingWorld()
        const [job] = await standbyInbound(world, "Hello?")
        expect(job?.name).toBe("threadControlEvent")
        expect((await stateOf(world)).state).toBe("standby")
        const stored = await messagesOf(world)
        expect(stored.map((m) => m.text)).toContain("Hello?")
        expect(graphCalls()).toHaveLength(0)
      })

      test("T-1b/T-2 template echo: rendered from sent values + definition, no reply", async () => {
        const world = await buildRoutingWorld()
        await deliver(standbyEchoes(world, templateEcho(world)))
        const echo = (await messagesOf(world)).find(
          (m) => m.messageType === "outgoing",
        )
        expect(echo?.text).toBe(
          "[image]\nOrder #1234 has shipped. Expected delivery: Thursday.",
        )
        expect(graphCalls()).toHaveLength(0)
      })

      test("T-1d standby statuses are acknowledged and dropped", async () => {
        const world = await buildRoutingWorld()
        const { jobs } = await postWebhook(standbyStatuses(world))
        expect(jobs).toHaveLength(0)
        expect(await messagesOf(world)).toHaveLength(0)
      })

      test("T-4 messages with summary context: summary stored for the agent", async () => {
        const world = await buildRoutingWorld()
        await deliver(
          ownerDelivery(
            world,
            textMessage(world, "Can I change the address?"),
            summaryContext("Customer got a shipping notification."),
          ),
        )
        const texts = JSON.stringify(await messagesOf(world))
        expect(texts).toContain("Customer got a shipping notification.")
        expect((await stateOf(world)).state).toBe("owned")
      })

      test("T-5 messages without context: normal owner delivery, automation allowed", async () => {
        const world = await buildRoutingWorld()
        const [job] = await inbound(world, "Plain")
        expect(job?.received?.suppressAutomation).toBeFalsy()
        expect((await stateOf(world)).state).toBe("owned")
      })

      test("T-6 control_passed with summary: we own it and keep the summary", async () => {
        const world = await buildRoutingWorld()
        await standbyInbound(world, "Need help")
        await deliver(
          handover(world, "control_passed", {
            previous_owner_role: "escalation",
            new_owner_role: "customer_service",
            metadata: "Refund approved",
            conversation_context: summaryContext("Refund approved by agent."),
          }),
        )
        const state = await stateOf(world)
        expect(state.state).toBe("owned")
        expect(JSON.stringify(await messagesOf(world))).toContain(
          "Refund approved by agent.",
        )
      })

      test("T-7 standby then the same message on messages: automation runs once", async () => {
        const world = await buildRoutingWorld()
        const message = textMessage(world, "Same message")
        const [standbyJob] = await deliver(standbyMessages(world, message))
        expect(standbyJob?.name).toBe("threadControlEvent")
        const [ownerJob] = await deliver(ownerDelivery(world, message))
        expect(ownerJob?.received?.message).toBeTruthy()
        expect(ownerJob?.received?.suppressAutomation).toBeFalsy()
        const [again] = await deliver(ownerDelivery(world, message))
        expect(again?.received?.message ?? null).toBeNull()
        expect((await stateOf(world)).state).toBe("owned")
      })
    })

    // ---------------------------------------------------------------- SC-1
    describe("SC-1 support conversation, start to finish (C1)", () => {
      test("full scenario", async () => {
        const world = await buildRoutingWorld()
        // 1
        await inbound(world, "Hi, where is my order #1234?")
        expect((await stateOf(world)).state).toBe("owned")
        // 2
        const reply = await agentSend(world, "It is being packed.")
        expect(reply.ok).toBe(true)
        expect(graphCalls("/messages")).toHaveLength(1)
        // 3 Test BM's Utility template: echo + status on standby
        await deliver(standbyEchoes(world, templateEcho(world)))
        await deliver(standbyStatuses(world))
        expect((await stateOf(world)).state).toBe("owned") // "It is still the owner"
        // 4
        await inbound(world, "Great. Can it arrive before Thursday?")
        expect((await stateOf(world)).state).toBe("owned")
        const reply4 = await agentSend(world, "Let me check.")
        expect(reply4.ok).toBe(true)
        // 5 quoted reply is not a change of intent
        await deliver(
          ownerDelivery(
            world,
            textMessage(world, "Can I still change the address?", {
              context: { from: "15550001111", id: "wamid.echo.notification" },
            }),
          ),
        )
        expect((await stateOf(world)).state).toBe("owned")
        // 6 release
        await threadAction(world, "release")
        expect(graphCalls("/thread_control").at(-1)?.body).toMatchObject({
          action: "release",
          messaging_product: "whatsapp",
        })
        expect((await stateOf(world)).state).toBe("idle")
        // 7
        await inbound(world, "One more question about my order")
        expect((await stateOf(world)).state).toBe("owned")
      })

      test("a partner's Service (free-form) echo does mean another app owns the thread", async () => {
        const world = await ownedWorld()
        await deliver(
          standbyEchoes(world, textEcho(world, "Hi, I'm the agent")),
        )
        expect((await stateOf(world)).state).toBe("standby")
      })

      test("a template echo on a standby thread keeps it standby", async () => {
        const world = await buildRoutingWorld()
        await standbyInbound(world, "hello")
        await deliver(standbyEchoes(world, templateEcho(world)))
        expect((await stateOf(world)).state).toBe("standby")
      })

      test("step 3 alone: a partner template echo must not take our thread", async () => {
        const world = await ownedWorld()
        await deliver(standbyEchoes(world, templateEcho(world)))
        expect((await stateOf(world)).state).toBe("owned")
        const reply = await agentSend(world, "Still here")
        expect(reply.ok).toBe(true)
      })
    })

    // ---------------------------------------------------------------- SC-2
    describe("SC-2 bot escalates to a human and gets it back (C1)", () => {
      test("full scenario with E-2, E-3, E-4", async () => {
        const world = await ownedWorld()
        // 2 untargeted pass with metadata
        await threadAction(world, "pass", {
          metadata: "Refund request, order #1234, item arrived broken",
        })
        const passBody = lastThreadControlBody()
        expect(passBody.action).toBe("pass")
        expect(passBody.metadata).toBe(
          "Refund request, order #1234, item arrived broken",
        )
        expect(passBody).not.toHaveProperty("control_pass")
        expect((await stateOf(world)).state).toBe("standby")

        // E-2: a Service send after passing must not reach Meta, no retry
        const blocked = await agentSend(world, "Are you there?")
        expect(blocked.ok).toBe(true) // terminal failure is recorded, not thrown
        expect(graphCalls("/messages")).toHaveLength(0)

        // 3 agent welcome echo + status
        await deliver(standbyEchoes(world, textEcho(world, "Hi, I'm Ana")))
        await deliver(standbyStatuses(world))
        // E-3: pass while Test BM owns → Meta refuses; state unchanged
        failGraphNext("/thread_control", {
          code: 100,
          message: "(#100) The caller is not the current thread owner",
        })
        await expect(threadAction(world, "pass")).rejects.toMatchObject({
          code: 100,
          isPermanent: true,
          isRetryable: false,
        })
        expect((await stateOf(world)).state).toBe("standby")
        // E-4: take while not escalation → 2494191; state unchanged
        failGraphNext("/thread_control", {
          code: 2_494_191,
          message:
            "You are not permitted to take thread control for this phone number.",
        })
        await expect(threadAction(world, "take")).rejects.toMatchObject({
          name: "ThreadControlTakeRefusedError",
        })
        expect((await stateOf(world)).state).toBe("standby")
        // 4..6
        const [s4] = await standbyInbound(world, "Sure, thanks")
        expect(s4?.name).toBe("threadControlEvent")
        await deliver(standbyEchoes(world, textEcho(world, "Refund approved")))
        await standbyInbound(world, "Can I also order a new blender?")
        expect(graphCalls("/messages")).toHaveLength(0)
        // 7 targeted pass back to customer_service
        await deliver(
          handover(world, "control_passed", {
            previous_owner_role: "escalation",
            new_owner_role: "customer_service",
            metadata: "Refund approved. Customer wants to order a replacement.",
          }),
        )
        const after = await stateOf(world)
        expect(after.state).toBe("owned")
        // 8
        const reply = await agentSend(world, "Here are the options")
        expect(reply.ok).toBe(true)
        expect(graphCalls("/messages")).toHaveLength(1)
      })
    })

    // ---------------------------------------------------------------- SC-3
    describe("SC-3 a supervisor steps in (C1)", () => {
      test("control_taken (take or implicit) locks us; pass back unlocks", async () => {
        const world = await ownedWorld()
        await inbound(
          world,
          "This is the third time. I want to speak to someone!",
        )
        // 4 supervisor take
        await deliver(
          handover(world, "control_taken", {
            previous_owner_role: "customer_service",
            new_owner_role: "escalation",
            metadata: "Supervisor stepping in",
          }),
        )
        expect((await stateOf(world)).state).toBe("standby")
        // E-5 the reply the bot had queued is dropped before Meta
        const queued = await agentSend(world, "Bot reply that was queued")
        expect(queued.ok).toBe(true)
        expect(graphCalls("/messages")).toHaveLength(0)
        // 5..6
        await deliver(standbyEchoes(world, textEcho(world, "Sorry about that")))
        await standbyInbound(world, "OK, thank you")
        // 7
        await deliver(
          handover(world, "control_passed", {
            previous_owner_role: "escalation",
            new_owner_role: "customer_service",
            metadata: "Resolved, priority delivery arranged",
          }),
        )
        expect((await stateOf(world)).state).toBe("owned")
        expect((await agentSend(world, "Anything else?")).ok).toBe(true)
        // 9..10 implicit take by a free-form send: same webhook + echo
        await inbound(world, "Can I get a discount for the trouble?")
        await deliver(
          handover(world, "control_taken", {
            previous_owner_role: "customer_service",
            new_owner_role: "escalation",
          }),
        )
        await deliver(
          standbyEchoes(world, textEcho(world, "Here is a voucher")),
        )
        expect((await stateOf(world)).state).toBe("standby")
        resetGraph()
        await agentSend(world, "Bot reply")
        expect(graphCalls("/messages")).toHaveLength(0)
      })
    })

    // ---------------------------------------------------------------- SC-4
    describe("SC-4 customer switches topics (C1)", () => {
      test("silent ownership changes without any handover webhook", async () => {
        const world = await buildRoutingWorld()
        // 1 Test BM's shipping notification on an idle thread
        await deliver(standbyEchoes(world, templateEcho(world)))
        await deliver(standbyStatuses(world))
        expect((await stateOf(world)).state).not.toBe("standby") // stays Idle
        // 2
        await inbound(world, "Hi, can I get an invoice for order #1234?")
        expect((await stateOf(world)).state).toBe("owned")
        // 3..4 our own buttons → button reply on messages keeps ownership
        expect(
          (await agentSend(world, "Email invoice / Talk to an agent")).ok,
        ).toBe(true)
        await deliver(
          ownerDelivery(
            world,
            textMessage(world, "", {
              type: "interactive",
              text: undefined,
              interactive: {
                type: "button_reply",
                button_reply: { id: "email_invoice", title: "Email invoice" },
              },
            }),
          ),
        )
        expect((await stateOf(world)).state).toBe("owned")
        // 5 tap on the template button → arrives on standby, no handover
        await deliver(
          standbyMessages(
            world,
            textMessage(world, "", {
              type: "button",
              text: undefined,
              button: {
                payload: "Change delivery date",
                text: "Change delivery date",
              },
              context: { from: "15550001111", id: "wamid.echo.notification" },
            }),
          ),
        )
        expect((await stateOf(world)).state).toBe("standby")
        // E-6 invoice flow tries to send: never reaches Meta, no crash
        resetGraph()
        const blocked = await agentSend(world, "Invoice is on its way")
        expect(blocked.ok).toBe(true)
        expect(graphCalls("/messages")).toHaveLength(0)
        // 6
        await deliver(standbyEchoes(world, textEcho(world, "Pick a new date")))
        await standbyInbound(world, "Saturday")
        // 7 back on messages with no handover
        await inbound(
          world,
          "Thanks. Can you send my invoice to ana@example.com?",
        )
        expect((await stateOf(world)).state).toBe("owned")
        expect((await agentSend(world, "Invoice sent")).ok).toBe(true)
        expect(graphCalls("/messages")).toHaveLength(1)
      })
    })

    // ---------------------------------------------------------------- SC-5
    describe("SC-5 marketing conversation escalated (C4)", () => {
      test("E-1 Service send on an idle thread is rejected by Meta (131070): no retry", async () => {
        const world = await buildRoutingWorld()
        failGraphNext("/messages", {
          code: 131_070,
          message:
            "Message failed to send because another app is controlling this thread now.",
        })
        const sent = await agentSend(world, "Hello from marketing")
        expect(graphCalls("/messages")).toHaveLength(1)
        // terminal: recorded as a failed message, never thrown into a retry
        expect(sent.ok).toBe(true)
        expect((await stateOf(world)).state).not.toBe("owned")
      })

      test("pass to escalation; nothing Service-sent afterwards", async () => {
        const world = await ownedWorld()
        await inbound(world, "Actually, my last order never arrived")
        await threadAction(world, "pass", {
          metadata: "Delivery issue, previous order not received",
        })
        expect(lastThreadControlBody()).toMatchObject({
          action: "pass",
          metadata: "Delivery issue, previous order not received",
        })
        expect(lastThreadControlBody()).not.toHaveProperty("control_pass")
        expect((await stateOf(world)).state).toBe("standby")
        await deliver(
          standbyEchoes(world, textEcho(world, "Support team here")),
        )
        await standbyInbound(world, "Order 5678")
        resetGraph()
        await agentSend(world, "Bot follow-up")
        expect(graphCalls("/messages")).toHaveLength(0)
        expect((await stateOf(world)).state).toBe("standby")
      })
    })

    // ---------------------------------------------------------------- SC-6
    describe("SC-6 picking up a conversation you did not see (C2)", () => {
      test("summaries on messages and on control_passed", async () => {
        const world = await buildRoutingWorld()
        await inbound(world, "Where is my order #1234?")
        await deliver(
          ownerDelivery(
            world,
            textMessage(
              world,
              "I just got a notification. Can I change the address?",
            ),
            summaryContext("Business sent: order #1234 has shipped."),
          ),
        )
        await threadAction(world, "pass", {
          metadata: "Address change after shipping",
        })
        expect(lastThreadControlBody()).toMatchObject({
          action: "pass",
          metadata: "Address change after shipping",
        })
        expect((await stateOf(world)).state).toBe("standby")
        await deliver(
          handover(world, "control_passed", {
            previous_owner_role: "escalation",
            new_owner_role: "customer_service",
            conversation_context: summaryContext(
              "Agent changed the address to 426 Au Co.",
            ),
          }),
        )
        expect((await stateOf(world)).state).toBe("owned")
        await deliver(
          handover(world, "control_taken", {
            previous_owner_role: "customer_service",
            new_owner_role: "escalation",
          }),
        )
        expect((await stateOf(world)).state).toBe("standby")
        await deliver(
          ownerDelivery(
            world,
            textMessage(world, "Perfect. When will it arrive now?"),
            summaryContext("Courier confirmed the change."),
          ),
        )
        expect((await stateOf(world)).state).toBe("owned")
        const all = JSON.stringify(await messagesOf(world))
        expect(all).toContain("Business sent: order #1234 has shipped.")
        expect(all).toContain("Agent changed the address to 426 Au Co.")
        expect(all).toContain("Courier confirmed the change.")
      })
    })

    // ---------------------------------------------------------------- SC-7
    describe("SC-7 we are the escalation partner (C3)", () => {
      test("take from the API response (no webhook), E-7, pass back, release", async () => {
        const world = await buildRoutingWorld()
        await standbyInbound(world, "I was charged twice for my order")
        await deliver(
          standbyEchoes(world, textEcho(world, "Generic billing answer")),
        )
        await standbyInbound(
          world,
          "That does not help. I want to talk to a person.",
        )
        expect((await stateOf(world)).state).toBe("standby")
        expect(graphCalls("/messages")).toHaveLength(0) // no accidental takeover
        // 4 take: success, no webhook for our own take
        await threadAction(world, "take", {
          metadata: "Agent taking over billing dispute",
        })
        expect(lastThreadControlBody()).toMatchObject({
          action: "take",
          metadata: "Agent taking over billing dispute",
        })
        expect(await stateOf(world)).toMatchObject({
          state: "owned",
          ownerRole: "escalation",
        })
        // E-7 untargeted pass as escalation partner → refused, stay owner
        failGraphNext("/thread_control", {
          code: 100,
          message: "(#100) The escalation partner cannot call untargeted pass",
        })
        await expect(threadAction(world, "pass")).rejects.toMatchObject({
          code: 100,
          isPermanent: true,
          isRetryable: false,
        })
        expect((await stateOf(world)).state).toBe("owned")
        // 5..6
        expect((await agentSend(world, "Hi, I'm Leo, refunding now.")).ok).toBe(
          true,
        )
        await inbound(world, "Thank you! Can I also update my email?")
        // 7 targeted pass to customer_service
        await threadAction(world, "pass", {
          targetRole: "customer_service",
          metadata: "Refund issued. Customer wants to update email.",
        })
        expect(lastThreadControlBody()).toMatchObject({
          action: "pass",
          control_pass: { target_role: "customer_service" },
          metadata: "Refund issued. Customer wants to update email.",
        })
        expect((await stateOf(world)).state).toBe("standby")
        // 8
        await deliver(
          standbyEchoes(world, textEcho(world, "New email address?")),
        )
        await standbyInbound(world, "ana@example.com")
        // 9 agent dismisses the lock and corrects by typing (implicit take)
        const fix = await agentSend(world, "Correct email is ana@example.com", {
          bypassThreadControlLock: true,
        })
        expect(fix.ok).toBe(true)
        expect((await stateOf(world)).state).toBe("owned")
        // 10
        await threadAction(world, "release")
        expect((await stateOf(world)).state).toBe("idle")
      })
    })

    // ---------------------------------------------------------------- handover note / target role
    describe("handover note and pass target (Meta thread_control body)", () => {
      test("passing to the escalation role is an untargeted pass (no control_pass)", async () => {
        const world = await ownedWorld()
        await threadAction(world, "pass", {
          targetRole: "escalation",
          metadata: "note",
        })

        const body = lastThreadControlBody()
        expect(body).toMatchObject({ action: "pass", metadata: "note" })
        expect(body).not.toHaveProperty("control_pass")
      })

      test("a release never carries a note (it raises no handover event)", async () => {
        const world = await ownedWorld()
        await threadAction(world, "release", { metadata: "ignored" })

        expect(lastThreadControlBody()).not.toHaveProperty("metadata")
      })
    })

    // ---------------------------------------------------------------- 131070
    describe("Meta send rejection 131070 (thread-control error table)", () => {
      const rejectNextSend = () =>
        failGraphNext("/messages", {
          code: 131_070,
          message:
            "Message failed to send because another app is controlling this thread now.",
        })

      test("E-1 idle thread: rejected send is not retried and locks the composer", async () => {
        const world = await buildRoutingWorld()
        await inbound(world, "Hi")
        await threadAction(world, "release")
        rejectNextSend()
        const sent = await agentSend(world, "Hello", { willRetryOnThrow: true })
        expect(sent.ok).toBe(true) // swallowed: no BullMQ retry
        expect(graphCalls("/messages")).toHaveLength(1)
        expect((await stateOf(world)).state).toBe("standby")
      })

      test("E-6 we missed a silent change: Meta's 131070 reconciles us to standby", async () => {
        const world = await ownedWorld()
        rejectNextSend()
        const sent = await agentSend(world, "Invoice", {
          willRetryOnThrow: true,
        })
        expect(sent.ok).toBe(true)
        expect((await stateOf(world)).state).toBe("standby")
        resetGraph()
        await agentSend(world, "Second try")
        expect(graphCalls("/messages")).toHaveLength(0) // gate now closed locally
      })
    })

    // ---------------------------------------------------------------- handovers
    describe("handover edge cases", () => {
      test("control_passed for an unknown contact creates it; control_taken is dropped", async () => {
        const world = await buildRoutingWorld()
        const strangerPassed = numericIdLike()
        await deliver(
          handover(
            world,
            "control_passed",
            {
              previous_owner_role: "escalation",
              new_owner_role: "customer_service",
            },
            { phone_number: strangerPassed },
          ),
        )
        expect(await contactInboxBySource(world, strangerPassed)).toMatchObject(
          {
            threadControlState: "owned",
          },
        )
        const strangerTaken = numericIdLike()
        await deliver(
          handover(
            world,
            "control_taken",
            {
              previous_owner_role: "customer_service",
              new_owner_role: "escalation",
            },
            { phone_number: strangerTaken },
          ),
        )
        expect(await contactInboxBySource(world, strangerTaken)).toBeUndefined()
      })

      test("malformed handover / standby envelopes are ACKed and change nothing", async () => {
        const world = await buildRoutingWorld()
        const withRecipient = handover(world, "control_taken", {
          previous_owner_role: "customer_service",
        }) as { entry: { changes: { value: Record<string, unknown> }[] }[] }
        const { recipient: _dropped, ...valueWithoutRecipient } =
          withRecipient.entry[0]?.changes[0]?.value ?? {}
        const noRecipient = {
          ...withRecipient,
          entry: [
            {
              ...withRecipient.entry[0],
              changes: [
                { field: "messaging_handovers", value: valueWithoutRecipient },
              ],
            },
          ],
        }
        const r1 = await postWebhook(noRecipient)
        expect(r1.jobs).toHaveLength(0)
        const noId = standbyMessages(world, {
          ...textMessage(world, "x"),
          id: undefined,
        })
        const r2 = await postWebhook(noId)
        expect(r2.jobs).toHaveLength(0)
        expect((await stateOf(world)).stored).toBeNull()
      })

      test("SC-7.9 a failed bypass send does not claim ownership", async () => {
        const world = await buildRoutingWorld()
        await standbyInbound(world, "hello")
        failGraphNext("/messages", {
          code: 131_000,
          message: "Something went wrong",
        })
        await agentSend(world, "Correction", { bypassThreadControlLock: true })
        expect((await stateOf(world)).state).toBe("standby")
      })

      // Deliberate (SC-7 step 1: "an accidental auto-reply is a takeover"): a
      // Service send never silently takes the thread. The escalation agent
      // takes over explicitly, or dismisses the lock (bypass, SC-7 step 9).
      test("a Service send on a standby thread never takes it silently", async () => {
        const world = await buildRoutingWorld()
        await standbyInbound(world, "hello")
        await agentSend(world, "Correction")
        expect(graphCalls("/messages")).toHaveLength(0)
        expect((await stateOf(world)).state).toBe("standby")
      })
    })

    // ---------------------------------------------------------------- resume flow
    describe("handover resume flow (T-6)", () => {
      test("control_passed starts the configured flow exactly once, never on redelivery", async () => {
        const world = await buildRoutingWorld()
        const flowId = createId()
        await db.insert(flowModel).values({
          id: flowId,
          name: "Resume",
          workspaceId: world.workspaceId,
          active: true,
          // A published flow (no FK on the column).
          currentVersionId: createId(),
        })
        await db
          .update(integrationWhatsappModel)
          .set({ handoverResumeFlowId: flowId })
          .where(eq(integrationWhatsappModel.inboxId, world.inboxId))
        await standbyInbound(world, "hi")
        const added = vi
          .spyOn(integrationQueue, "add")
          .mockResolvedValue(undefined as never)
        try {
          const body = handover(world, "control_passed", {
            previous_owner_role: "escalation",
            new_owner_role: "customer_service",
          })
          const first = await postWebhook(body)
          await runJobs(first.jobs)
          const redelivered = await postWebhook(body)
          await runJobs(redelivered.jobs)
          const flowStarts = added.mock.calls.filter(
            ([name, job]) =>
              name === "sendFlow" &&
              (job as { data: { flowId?: string } }).data.flowId === flowId,
          )
          expect(flowStarts).toHaveLength(1)
        } finally {
          added.mockRestore()
        }
        expect((await stateOf(world)).state).toBe("owned")
      })
    })

    // ---------------------------------------------------------------- roles
    describe("routing roles (GET /{phone_number_id}/routing_roles)", () => {
      const sync = async (world: RoutingWorld) => {
        const { integrationWhatsappService } = await import(
          "@chatbotx.io/business"
        )
        const { getRoutingRoles } = await import(
          "@chatbotx.io/integration-whatsapp/api/routing-roles"
        )
        const integration = await db.query.integrationWhatsappModel.findFirst({
          where: { inboxId: world.inboxId },
        })
        return await integrationWhatsappService.syncRoutingRoles({
          id: integration?.id ?? "",
          workspaceId: world.workspaceId,
          fetchRoutingRoles: ({ accessToken, version, phoneNumberId }) =>
            getRoutingRoles({
              auth: { tokens: { accessToken }, version },
              phoneNumberId,
            }),
        })
      }

      test("stores Meta's answer; escalation can take, others cannot", async () => {
        const world = await buildRoutingWorld()
        respondGraph("/routing_roles", {
          roles: ["customer_service"],
          is_standby: true,
        })
        const snapshot = await sync(world)
        expect(snapshot).toMatchObject({
          enabled: true,
          roles: ["customer_service"],
          isStandby: true,
        })
        expect(resolveThreadTakePermission(snapshot)).toBe("forbidden")
        const { integrationWhatsappService } = await import(
          "@chatbotx.io/business"
        )
        expect(
          await integrationWhatsappService.findRoutingRolesByInbox({
            inboxId: world.inboxId,
            workspaceId: world.workspaceId,
          }),
        ).toEqual(snapshot)

        respondGraph("/routing_roles", {
          roles: ["escalation"],
          is_standby: false,
        })
        tick() // a later check: the guard only stores a newer snapshot
        expect(resolveThreadTakePermission(await sync(world))).toBe("allowed")
      })

      test("routing not enabled for the number: no role, take left to Meta", async () => {
        const world = await buildRoutingWorld()
        failGraphNext("/routing_roles", {
          code: 100,
          message: "Conversation routing is not enabled for this phone number.",
        })
        const snapshot = await sync(world)
        expect(snapshot.enabled).toBe(false)
        expect(resolveThreadTakePermission(snapshot)).toBe("unknown")
      })

      test("a sync answered after a newer one never overwrites it (real SQL guard)", async () => {
        const world = await buildRoutingWorld()
        const { integrationWhatsappService } = await import(
          "@chatbotx.io/business"
        )
        const integration = await db.query.integrationWhatsappModel.findFirst({
          where: { inboxId: world.inboxId },
        })
        const base = {
          id: integration?.id ?? "",
          workspaceId: world.workspaceId,
        }
        const started = new Date()
        // The newer sync (started later) lands first.
        const newer = await integrationWhatsappService.syncRoutingRoles({
          ...base,
          fetchRoutingRoles: async () => ({
            enabled: true,
            roles: ["escalation"],
            isStandby: false,
          }),
          now: new Date(started.getTime() + 60_000),
        })
        // The older sync (started earlier) answers last with stale roles.
        const older = await integrationWhatsappService.syncRoutingRoles({
          ...base,
          fetchRoutingRoles: async () => ({
            enabled: true,
            roles: ["customer_service"],
            isStandby: true,
          }),
          now: started,
        })
        expect(older).toEqual(newer)
        expect(await integrationWhatsappService.findRoutingRoles(base)).toEqual(
          newer,
        )
      })

      test("a Meta failure keeps the previous snapshot", async () => {
        const world = await buildRoutingWorld()
        respondGraph("/routing_roles", {
          roles: ["escalation"],
          is_standby: true,
        })
        const before = await sync(world)
        failGraphNext("/routing_roles", {
          code: 2,
          message: "Service unavailable",
        })
        await expect(sync(world)).rejects.toBeTruthy()
        const { integrationWhatsappService } = await import(
          "@chatbotx.io/business"
        )
        expect(
          await integrationWhatsappService.findRoutingRolesByInbox({
            inboxId: world.inboxId,
            workspaceId: world.workspaceId,
          }),
        ).toEqual(before)
      })
    })

    // ---------------------------------------------------------------- 24h
    describe("idle after 24h of WhatsApp user inactivity", () => {
      test("D-1 an owned thread with no customer message for 24h reads idle", async () => {
        const world = await ownedWorld()
        vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 5000)
        expect((await stateOf(world)).state).toBe("idle")
      })

      // Without standby access we never see the customer's messages to the
      // other owner. A handover proves the thread was live at that moment, so
      // the latest possible idle instant (handover + 24h) is kept; a wrong
      // guess self-corrects (131070 / the next routed delivery).
      test("D-2 a handover keeps the thread non-idle for up to 24h when no newer customer message was seen", async () => {
        const world = await buildRoutingWorld()
        await standbyInbound(world, "hi")
        vi.setSystemTime(Date.now() + 20 * 60 * 60 * 1000)
        await deliver(
          handover(world, "control_taken", {
            previous_owner_role: "customer_service",
            new_owner_role: "escalation",
          }),
        )
        // 25h after the last message we saw, 5h after the handover
        vi.setSystemTime(Date.now() + 5 * 60 * 60 * 1000)
        expect((await stateOf(world)).state).toBe("standby")
        vi.setSystemTime(Date.now() + 20 * 60 * 60 * 1000)
        expect((await stateOf(world)).state).toBe("idle")
      })
    })

    // ---------------------------------------------------------------- extras
    describe("devdocs / parsing extras", () => {
      test("D-5 a number that never saw routing keeps the thread null", async () => {
        const world = await buildRoutingWorld({ routingActive: false })
        await inbound(world, "Hi")
        expect((await stateOf(world)).stored).toBeNull()
      })

      test("P-1 handover in the Integration Guide shape (META_AI app role)", async () => {
        const world = await buildRoutingWorld()
        await standbyInbound(world, "hi")
        await deliver(
          handover(world, "control_passed", {
            previous_owner_app_id: "1234567890123456",
            previous_owner_app_role: "META_AI",
            metadata: "Information about the conversation",
          }),
        )
        expect((await stateOf(world)).state).toBe("owned")
      })

      test("P-3 handover without sender.phone_number (BSUID only) is not dropped", async () => {
        const world = await buildRoutingWorld()
        await setSourceUserId(world, `US.${world.waId}`)
        await standbyInbound(world, "hi")
        await deliver(
          handover(
            world,
            "control_passed",
            {
              previous_owner_role: "escalation",
              new_owner_role: "customer_service",
            },
            { user_id: `US.${world.waId}` },
          ),
        )
        expect((await stateOf(world)).state).toBe("owned")
      })

      test("P-6 an unsigned webhook enqueues nothing", async () => {
        const world = await buildRoutingWorld()
        await expect(
          postWebhook(
            handover(world, "control_taken", {
              previous_owner_role: "customer_service",
            }),
            { signature: "sha256=deadbeef" },
          ),
        ).rejects.toThrow("signature verification failed")
        expect((await stateOf(world)).stored).toBeNull()
      })

      test("P-7 a redelivered handover applies once", async () => {
        const world = await buildRoutingWorld()
        await standbyInbound(world, "hi")
        const body = handover(world, "control_passed", {
          previous_owner_role: "escalation",
          new_owner_role: "customer_service",
        })
        const first = await postWebhook(body)
        const second = await postWebhook(body)
        expect(first.jobs[0]?.opts.jobId).toBe(second.jobs[0]?.opts.jobId)
        await runJobs([...first.jobs, ...second.jobs])
        expect((await stateOf(world)).state).toBe("owned")
      })

      test("D-6 an older control_taken processed after a newer owner delivery loses", async () => {
        const world = await buildRoutingWorld()
        const taken = handover(world, "control_taken", {
          previous_owner_role: "customer_service",
          new_owner_role: "escalation",
        })
        await inbound(world, "newer")
        await deliver(taken)
        expect((await stateOf(world)).state).toBe("owned")
      })
    })
  },
)
