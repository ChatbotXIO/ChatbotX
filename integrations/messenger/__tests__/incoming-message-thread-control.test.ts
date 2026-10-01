import { afterEach, describe, expect, test, vi } from "vitest"
import { receiveMessage } from "../src/handlers/message/incoming-message"
import {
  BUSINESS_AI_APP_ID,
  BUSINESS_AI_APP_ID_ENV,
} from "../src/lib/thread-control-config"

const PAGE = "page-1"
const PSID = "psid-1"
const TS_MS = 1_755_694_800_750
const TS_FLOORED = new Date(1_755_694_800_000)

const receive = async (entry: Record<string, unknown>) =>
  await receiveMessage({
    ctx: { auth: { metadata: { pageId: PAGE } } } as never,
    data: {
      integrationType: "messenger",
      integrationIdentifier: "inbox-1",
      payload: {
        object: "page",
        entry: [{ id: PAGE, time: TS_MS, ...entry }],
      },
    },
  })

const customerMessage = (mid: string) => ({
  sender: { id: PSID },
  recipient: { id: PAGE },
  timestamp: TS_MS,
  message: { mid, text: "hello" },
})

describe("Messenger receiveMessage - thread control delivery", () => {
  test("an ordinary inbound message is an owner delivery with a whole-second occurredAt", async () => {
    const result = await receive({ messaging: [customerMessage("mid-1")] })

    expect(result.threadControl).toEqual({
      delivery: "owner",
      occurredAt: TS_FLOORED,
    })
    expect(result.message).toMatchObject({
      sourceId: "mid-1",
      messageType: "incoming",
      text: "hello",
    })
  })

  test("an owner postback is an owner delivery", async () => {
    const result = await receive({
      messaging: [
        {
          sender: { id: PSID },
          recipient: { id: PAGE },
          timestamp: TS_MS,
          postback: { mid: "mid-pb", title: "Go", payload: "ACTION" },
        },
      ],
    })

    expect(result.threadControl?.delivery).toBe("owner")
    expect(result.postbackAction).toBe("ACTION")
  })

  test("our own echo on the owner feed is not marked as an owner delivery", async () => {
    const result = await receive({
      messaging: [
        {
          sender: { id: PAGE },
          recipient: { id: PSID },
          timestamp: TS_MS,
          message: { mid: "mid-echo", text: "hi", is_echo: true },
        },
      ],
    })

    expect(result.threadControl).toBeUndefined()
    expect(result.message?.messageType).toBe("outgoing")
  })

  test("a standby message is a standby delivery on the same mid", async () => {
    const owner = await receive({ messaging: [customerMessage("mid-2")] })
    const standby = await receive({ standby: [customerMessage("mid-2")] })

    expect(standby.threadControl).toEqual({
      delivery: "standby",
      occurredAt: TS_FLOORED,
    })
    expect(standby.message?.sourceId).toBe(owner.message?.sourceId)
    expect(standby.contact.sourceId).toBe(PSID)
  })

  test("a standby postback never routes a flow action and tolerates a stripped payload", async () => {
    const result = await receive({
      standby: [
        {
          sender: { id: PSID },
          recipient: { id: PAGE },
          timestamp: TS_MS,
          postback: { mid: "mid-sb-pb" },
        },
      ],
    })

    expect(result.threadControl?.delivery).toBe("standby")
    expect(result.postbackAction).toBeNull()
    expect(result.quickReplyAction).toBeNull()
    expect(result.message?.sourceId).toBe("mid-sb-pb")
  })

  test("a standby echo is the partner's outgoing third-party message", async () => {
    const result = await receive({
      standby: [
        {
          sender: { id: PAGE },
          recipient: { id: PSID },
          timestamp: TS_MS,
          message: { mid: "mid-sb-echo", text: "partner reply", is_echo: true },
        },
      ],
    })

    expect(result.threadControl?.delivery).toBe("standby")
    expect(result.message).toMatchObject({
      messageType: "outgoing",
      contentAttributes: { threadControlEcho: true },
    })
    expect(result.echoOrigin).toBe("thirdParty")
    expect(result.contact.sourceId).toBe(PSID)
  })

  test("an entry with neither messaging nor standby is rejected", async () => {
    await expect(receive({})).rejects.toThrow("No messaging found")
  })
})

describe("Messenger receiveMessage - hop_context standby owner", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("is_ai_thread_owner:true on a standby entry names the Business-AI app as owner", async () => {
    vi.stubEnv(BUSINESS_AI_APP_ID_ENV, "app-bot")

    const result = await receive({
      hop_context: { is_ai_thread_owner: true },
      standby: [customerMessage("mid-h1")],
    })

    expect(result.threadControl).toEqual({
      delivery: "standby",
      occurredAt: TS_FLOORED,
      ownerAppId: "app-bot",
      ownerRole: "ai_agent",
    })
  })

  test("without the flag, or with it false, the owner stays unstated", async () => {
    vi.stubEnv(BUSINESS_AI_APP_ID_ENV, "app-bot")

    const absent = await receive({ standby: [customerMessage("mid-h2")] })
    const off = await receive({
      hop_context: { is_ai_thread_owner: false },
      standby: [customerMessage("mid-h3")],
    })

    expect(absent.threadControl).not.toHaveProperty("ownerAppId")
    expect(off.threadControl).not.toHaveProperty("ownerAppId")
    expect(absent.threadControl).not.toHaveProperty("ownerRole")
    expect(off.threadControl).not.toHaveProperty("ownerRole")
  })

  test("with no env override the fixed Business-AI app id is used", async () => {
    vi.stubEnv(BUSINESS_AI_APP_ID_ENV, "")

    const result = await receive({
      hop_context: { is_ai_thread_owner: true },
      standby: [customerMessage("mid-h4")],
    })

    // The Business-AI app id is a fixed Meta constant, so detection works even
    // with no env configured.
    expect(result.threadControl).toMatchObject({
      ownerAppId: BUSINESS_AI_APP_ID,
      ownerRole: "ai_agent",
    })
    expect(BUSINESS_AI_APP_ID).toBe("622851382610562")
  })

  test("an owner delivery never sets an owner app id", async () => {
    vi.stubEnv(BUSINESS_AI_APP_ID_ENV, "app-bot")

    const result = await receive({
      hop_context: { is_ai_thread_owner: true },
      messaging: [customerMessage("mid-h5")],
    })

    expect(result.threadControl).not.toHaveProperty("ownerAppId")
  })
})

describe("Messenger receiveMessage - Business-AI standby echo signals", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const echo = (mid: string, message: Record<string, unknown>) => ({
    sender: { id: PAGE },
    recipient: { id: PSID },
    timestamp: TS_MS,
    message: { mid, is_echo: true, ...message },
  })

  test("ai_generated:true on a standby echo names the Business-AI app as owner", async () => {
    vi.stubEnv(BUSINESS_AI_APP_ID_ENV, "app-bot")

    const result = await receive({
      standby: [echo("mid-ai1", { ai_generated: true })],
    })

    expect(result.threadControl).toMatchObject({
      delivery: "standby",
      ownerAppId: "app-bot",
      ownerRole: "ai_agent",
    })
  })

  test("persists the ai_generated flag on an AI standby echo, omits it otherwise", async () => {
    vi.stubEnv(BUSINESS_AI_APP_ID_ENV, "app-bot")

    const ai = await receive({
      standby: [echo("mid-ai-flag", { ai_generated: true })],
    })
    expect(ai.message?.contentAttributes).toMatchObject({
      threadControlEcho: true,
      aiGenerated: true,
    })

    const partner = await receive({
      standby: [echo("mid-partner-flag", { app_id: "other-app" })],
    })
    expect(partner.message?.contentAttributes).toMatchObject({
      threadControlEcho: true,
    })
    expect(partner.message?.contentAttributes).not.toHaveProperty("aiGenerated")
  })

  test("a standby echo whose app_id is the Business-AI app names it as owner", async () => {
    vi.stubEnv(BUSINESS_AI_APP_ID_ENV, "app-bot")

    const result = await receive({
      standby: [echo("mid-ai2", { app_id: "app-bot" })],
    })

    expect(result.threadControl).toMatchObject({
      ownerAppId: "app-bot",
      ownerRole: "ai_agent",
    })
  })

  test("a standby echo from a different app leaves the owner unstated", async () => {
    vi.stubEnv(BUSINESS_AI_APP_ID_ENV, "app-bot")

    const result = await receive({
      standby: [echo("mid-ai3", { app_id: "other-app" })],
    })

    expect(result.threadControl).not.toHaveProperty("ownerAppId")
    expect(result.threadControl).not.toHaveProperty("ownerRole")
  })
})
