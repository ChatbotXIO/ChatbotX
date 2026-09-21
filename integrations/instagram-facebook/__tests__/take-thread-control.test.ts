import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test, vi } from "vitest"
import { takeThreadControl } from "../src/apis/page"
import { API_URL, DEFAULT_API_VERSION } from "../src/constants"
import { isNotThreadOwnerError } from "../src/lib/error-mapper"
import type { InstagramAuthValue } from "../src/schemas"

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep, sendMessage } = await import(
  "../src/handlers/message/outgoing-message"
)

const ACCESS_TOKEN = "PAGE_TOKEN"
const IG_ID = "ig-business-account-id"
const PAGE_ID = "facebook-page-id"
const IGSID = "1268908927651563"
const SEND_URL = `${API_URL}/${DEFAULT_API_VERSION}/me/messages`
const HANDOVER_URL = `${API_URL}/${DEFAULT_API_VERSION}/${PAGE_ID}/take_thread_control`
const MISSING_PAGE_ID_ERROR = /pageId/
const MISSING_METADATA_ERROR = /no metadata/
const MISSING_RECIPIENT_ERROR = /recipient id/

// The exact body Meta returned in s170 when the Instagram inbox owned the
// thread (feature-tests sec. 33 row 13).
const NOT_THREAD_OWNER_BODY = {
  error: {
    message:
      "(#100 - 2534037) The action is invalid since it's not the thread owner",
    type: "OAuthException",
    code: 200,
    error_subcode: 2_534_037,
    fbtrace_id: "trace",
  },
}

const auth: InstagramAuthValue = {
  tokens: { accessToken: ACCESS_TOKEN },
  metadata: {
    igId: IG_ID,
    igName: "ig-name",
    pageId: PAGE_ID,
    version: DEFAULT_API_VERSION,
  },
} as InstagramAuthValue

const ctx = { auth } as never
const contact = { id: "contact-1", sourceId: IGSID } as never

type Counters = { sends: number; handovers: number }

/** Send API refuses `refusals` times with 2534037, then succeeds. */
function stubGraph(refusals: number, handover: "ok" | "fail" = "ok"): Counters {
  const counters: Counters = { sends: 0, handovers: 0 }
  server.use(
    http.post(SEND_URL, () => {
      counters.sends += 1
      if (counters.sends <= refusals) {
        return HttpResponse.json(NOT_THREAD_OWNER_BODY, { status: 400 })
      }
      return HttpResponse.json({
        recipient_id: IGSID,
        message_id: `mid-${counters.sends}`,
      })
    }),
    http.post(HANDOVER_URL, async ({ request }) => {
      counters.handovers += 1
      expect(request.headers.get("authorization")).toBe(
        `Bearer ${ACCESS_TOKEN}`,
      )
      await expect(request.json()).resolves.toMatchObject({
        recipient: { id: IGSID },
      })
      if (handover === "fail") {
        return HttpResponse.json(
          { error: { message: "(#10) Permission denied", code: 10 } },
          { status: 403 },
        )
      }
      return HttpResponse.json({ success: true })
    }),
  )
  return counters
}

describe("takeThreadControl", () => {
  test("posts to the Page node with the Page token", async () => {
    const counters = stubGraph(0)
    await expect(takeThreadControl(auth, IGSID)).resolves.toEqual({
      success: true,
    })
    expect(counters.handovers).toBe(1)
  })

  test("rejects without a pageId instead of posting to /undefined/take_thread_control", async () => {
    const authWithoutPageId = {
      tokens: { accessToken: ACCESS_TOKEN },
      metadata: { igId: IG_ID, version: DEFAULT_API_VERSION },
    } as unknown as InstagramAuthValue
    await expect(takeThreadControl(authWithoutPageId, IGSID)).rejects.toThrow(
      MISSING_PAGE_ID_ERROR,
    )
  })

  test("rejects an auth without metadata with a typed error, not a TypeError", async () => {
    const bareAuth = { tokens: { accessToken: ACCESS_TOKEN } } as never
    await expect(takeThreadControl(bareAuth, IGSID)).rejects.toThrow(
      MISSING_METADATA_ERROR,
    )
  })

  test("rejects an empty recipient id", async () => {
    await expect(takeThreadControl(auth, "")).rejects.toThrow(
      MISSING_RECIPIENT_ERROR,
    )
  })
})

describe("isNotThreadOwnerError", () => {
  test("is false for non-Instagram errors and for other Graph codes", () => {
    expect(isNotThreadOwnerError(null)).toBe(false)
    expect(isNotThreadOwnerError(new Error("boom"))).toBe(false)
  })
})

describe("sendMessage with the Handover Protocol", () => {
  test("2534037 once: takes the thread and retries exactly once", async () => {
    const counters = stubGraph(1)
    const result = await sendMessage({
      ctx,
      data: {
        contact,
        message: { id: "msg-1", contentType: "text", text: "hello" },
      },
    } as never)
    expect(result).toEqual({ messageIds: ["mid-2"] })
    expect(counters).toEqual({ sends: 2, handovers: 1 })
  })

  test("2534037 twice: one handover, the second refusal propagates", async () => {
    const counters = stubGraph(2)
    await expect(
      sendMessage({
        ctx,
        data: {
          contact,
          message: { id: "msg-1", contentType: "text", text: "hello" },
        },
      } as never),
    ).rejects.toMatchObject({ code: 200, subCode: 2_534_037 })
    expect(counters).toEqual({ sends: 2, handovers: 1 })
  })

  test("take_thread_control failing propagates its own error, no second send", async () => {
    const counters = stubGraph(1, "fail")
    await expect(
      sendMessage({
        ctx,
        data: {
          contact,
          message: { id: "msg-1", contentType: "text", text: "hello" },
        },
      } as never),
    ).rejects.toMatchObject({ code: 10 })
    expect(counters).toEqual({ sends: 1, handovers: 1 })
  })

  test("a non-2534037 refusal never triggers a handover", async () => {
    let sends = 0
    let handovers = 0
    server.use(
      http.post(SEND_URL, () => {
        sends += 1
        return HttpResponse.json(
          { error: { message: "(#10) Permission denied", code: 10 } },
          { status: 403 },
        )
      }),
      http.post(HANDOVER_URL, () => {
        handovers += 1
        return HttpResponse.json({ success: true })
      }),
    )
    await expect(
      sendMessage({
        ctx,
        data: {
          contact,
          message: { id: "msg-1", contentType: "text", text: "hello" },
        },
      } as never),
    ).rejects.toMatchObject({ code: 10 })
    expect(sends).toBe(1)
    expect(handovers).toBe(0)
  })
})

describe("sendFlowStep with the Handover Protocol", () => {
  test("sendText step recovers from 2534037 with one handover", async () => {
    const counters = stubGraph(1)
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendText",
          text: "automated reply",
          buttons: [],
        },
      },
    } as never)
    expect(result).toEqual({ messageIds: ["mid-2"] })
    expect(counters).toEqual({ sends: 2, handovers: 1 })
  })
})
