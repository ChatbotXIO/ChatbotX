import {
  ChannelErrorCategory,
  ThreadControlTakeRefusedError,
} from "@chatbotx.io/sdk"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getRoutingRoles } from "../src/api/routing-roles"
import { postThreadControl } from "../src/api/thread-control"
import { subscribeWebhook } from "../src/api/webhook"
import { conversationHandlers } from "../src/handlers/conversation"
import { logger } from "../src/lib/logger"

/**
 * Conversation Routing Graph calls against a faked `fetch`: request shapes and
 * how Meta's answers/errors are read (Meta devdocs: thread-control error table,
 * routing-roles reference; Partner Testing Guide §2.1, §2.2).
 */

const auth = {
  tokens: { accessToken: "tok" },
  version: "v23.0",
  verifyToken: "verify",
  metadata: { phoneNumber: { id: "pn-1" }, wabaId: "waba-1" },
} as never

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
let respond: (call: Call) => Response

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const metaError = (code: number, message: string, extra = {}) =>
  json(400, {
    error: {
      message,
      type: "OAuthException",
      code,
      fbtrace_id: "trace-1",
      ...extra,
    },
  })

beforeEach(() => {
  calls = []
  respond = () => json(200, {})
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init)
      const text = await request.clone().text()
      const call = {
        url: request.url,
        method: request.method,
        body: text ? JSON.parse(text) : null,
      }
      calls.push(call)
      return respond(call)
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("subscribeWebhook — Testing Guide §2.1", () => {
  it.each([
    [false],
    [true],
  ])("subscribes messages, messaging_handovers and standby (automatic events %s)", async (includeAutomaticEvents) => {
    respond = () => json(200, { success: true })
    await subscribeWebhook({ auth, includeAutomaticEvents })
    const fields = (calls[0]?.body as { subscribed_fields: string[] })
      .subscribed_fields
    expect(fields).toEqual(
      expect.arrayContaining(["messages", "messaging_handovers", "standby"]),
    )
    expect(calls[0]?.url).toContain("/waba-1/subscribed_apps")
  })
})

describe("getRoutingRoles — GET /{phone_number_id}/routing_roles", () => {
  it("reads roles and standby access", async () => {
    respond = () =>
      json(200, {
        roles: ["customer_service", "escalation"],
        is_standby: false,
      })
    await expect(
      getRoutingRoles({ auth, phoneNumberId: "pn-1" }),
    ).resolves.toEqual({
      enabled: true,
      roles: ["customer_service", "escalation"],
      isStandby: false,
    })
    expect(calls[0]).toMatchObject({ method: "GET" })
    expect(calls[0]?.url).toContain("/v23.0/pn-1/routing_roles")
  })

  it("an empty roles array is a successful answer", async () => {
    respond = () => json(200, { roles: [], is_standby: true })
    await expect(
      getRoutingRoles({ auth, phoneNumberId: "pn-1" }),
    ).resolves.toEqual({
      enabled: true,
      roles: [],
      isStandby: true,
    })
  })

  it("code 100 'not enabled' means routing is off for the number", async () => {
    respond = () =>
      metaError(
        100,
        "Conversation routing is not enabled for this phone number.",
      )
    await expect(
      getRoutingRoles({ auth, phoneNumberId: "pn-1" }),
    ).resolves.toEqual({
      enabled: false,
      roles: [],
      isStandby: false,
    })
  })

  it("any other error propagates", async () => {
    respond = () =>
      metaError(100, "Unsupported get request. Object does not exist")
    await expect(
      getRoutingRoles({ auth, phoneNumberId: "pn-1" }),
    ).rejects.toThrow("Unsupported get")
  })
})

describe("postThreadControl — request id (Testing Guide §2.2)", () => {
  it("returns Meta's request_id", async () => {
    respond = () => json(200, { success: true, request_id: "req-42" })
    await expect(
      postThreadControl(auth, {
        messaging_product: "whatsapp",
        to: "15551234567",
        action: "release",
      }),
    ).resolves.toEqual({ requestId: "req-42" })
  })
})

describe("updateThreadControl — refusals are never credential failures", () => {
  const run = (action: "take" | "pass" | "release") =>
    conversationHandlers.updateThreadControl({
      ctx: { auth },
      data: { contact: { sourceId: "15551234567" }, action },
    } as never)

  it("2494191 on take is ThreadControlTakeRefusedError (PERMISSION_DENIED) and logs Meta's fbtrace_id", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined)
    respond = () =>
      metaError(
        2_494_191,
        "You are not permitted to take thread control for this phone number.",
      )
    const error = await run("take").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ThreadControlTakeRefusedError)
    expect(error).toMatchObject({
      category: ChannelErrorCategory.PERMISSION_DENIED,
    })
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "take",
        code: 2_494_191,
        fbtraceId: "trace-1",
      }),
      "Whatsapp thread_control refused",
    )
  })

  it.each([
    ["pass", "(#100) The caller is not the current thread owner"],
    ["pass", "(#100) The escalation partner cannot call untargeted pass"],
    ["release", "(#100) Pass action is not supported."],
  ] as const)("%s refused with code 100 (%s) is permanent, never retried", async (action, message) => {
    respond = () => metaError(100, message)
    await expect(run(action)).rejects.toMatchObject({
      code: 100,
      isPermanent: true,
      isRetryable: false,
    })
  })

  it("a successful call reports the owner role after it", async () => {
    respond = () => json(200, { success: true, request_id: "req-1" })
    await expect(run("take")).resolves.toEqual({ ownerRole: "escalation" })
    await expect(run("release")).resolves.toEqual({ ownerRole: null })
  })
})
