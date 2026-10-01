import {
  ChannelError,
  ChannelErrorCategory,
  ThreadControlTakeRefusedError,
} from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_API_VERSION } from "../src/constants"
import {
  conversationHandlers,
  isResumeEligibleHandover,
  THREAD_CONTROL_ACTION_UNSUPPORTED_CODE,
} from "../src/handlers/conversation"
import { BUSINESS_AI_APP_ID_ENV } from "../src/lib/thread-control-config"

const BASE = "https://graph.facebook.com"
const TAKE_URL = `${BASE}/${DEFAULT_API_VERSION}/me/take_thread_control`
const PASS_URL = `${BASE}/${DEFAULT_API_VERSION}/me/pass_thread_control`
const PSID = "psid-1"
const OWN_APP = "app-own"
const BOT_APP = "app-bot"
const PARTNER_APP = "app-partner"

const ctx = {
  auth: {
    clientId: OWN_APP,
    tokens: { accessToken: "PAGE_TOKEN" },
    metadata: { pageId: "page-1" },
  },
} as never

const updateThreadControl = (action: "take" | "pass" | "release") =>
  conversationHandlers.updateThreadControl({
    ctx,
    data: { contact: { id: "ci-1", sourceId: PSID }, action },
  } as never)

/** Records the body of the next request to `url` and answers `response`. */
const captureBody = (url: string, response: Response) => {
  const seen: { body: unknown; auth: string | null }[] = []
  server.use(
    http.post(url, async ({ request }) => {
      seen.push({
        body: await request.json(),
        auth: request.headers.get("authorization"),
      })
      return response
    }),
  )
  return seen
}

beforeEach(() => {
  vi.stubEnv(BUSINESS_AI_APP_ID_ENV, BOT_APP)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("updateThreadControl", () => {
  it("take: POSTs take_thread_control for the PSID and reports OUR app as owner", async () => {
    const seen = captureBody(TAKE_URL, HttpResponse.json({ success: true }))

    const result = await updateThreadControl("take")

    expect(seen).toEqual([
      { body: { recipient: { id: PSID } }, auth: "Bearer PAGE_TOKEN" },
    ])
    expect(result).toEqual({ ownerRole: null, ownerAppId: OWN_APP })
  })

  it("pass: POSTs pass_thread_control with target_app_id and reports the target as owner", async () => {
    const seen = captureBody(PASS_URL, HttpResponse.json({ success: true }))

    const result = await updateThreadControl("pass")

    expect(seen[0]?.body).toEqual({
      recipient: { id: PSID },
      target_app_id: BOT_APP,
    })
    expect(result).toEqual({ ownerRole: "ai_agent", ownerAppId: BOT_APP })
  })

  it("pass uses the fixed Business-AI target even with no env override", async () => {
    vi.stubEnv(BUSINESS_AI_APP_ID_ENV, "  ")
    const seen = captureBody(PASS_URL, HttpResponse.json({ success: true }))

    const result = await updateThreadControl("pass")

    // The Business-AI app id is a fixed Meta constant: "return to bot" is always
    // configured, never a refusal.
    expect(seen[0]?.body).toEqual({
      recipient: { id: PSID },
      target_app_id: "622851382610562",
    })
    expect(result).toEqual({
      ownerRole: "ai_agent",
      ownerAppId: "622851382610562",
    })
  })

  it("release is refused up front as a permanent, non-retryable error (no call, no idle)", async () => {
    const takeSeen = captureBody(TAKE_URL, HttpResponse.json({ success: true }))
    const passSeen = captureBody(PASS_URL, HttpResponse.json({ success: true }))

    const error = await updateThreadControl("release").catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ChannelError)
    expect((error as ChannelError).code).toBe(
      THREAD_CONTROL_ACTION_UNSUPPORTED_CODE,
    )
    expect((error as ChannelError).isRetryable).toBe(false)
    expect(takeSeen).toHaveLength(0)
    expect(passSeen).toHaveLength(0)
  })

  it("a permission refusal on take becomes ThreadControlTakeRefusedError with Messenger wording", async () => {
    server.use(
      http.post(TAKE_URL, () =>
        HttpResponse.json(
          { error: { message: "(#10) Permission denied", code: 10 } },
          { status: 400 },
        ),
      ),
    )

    const error = await updateThreadControl("take").catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ThreadControlTakeRefusedError)
    const refused = error as ThreadControlTakeRefusedError
    expect(refused.category).toBe(ChannelErrorCategory.PERMISSION_DENIED)
    expect(refused.message).toContain("primary receiver")
    expect(refused.message.toLowerCase()).not.toContain("escalation")
  })

  it("a { success: false } answer on take is a refusal too", async () => {
    captureBody(TAKE_URL, HttpResponse.json({ success: false }))

    await expect(updateThreadControl("take")).rejects.toBeInstanceOf(
      ThreadControlTakeRefusedError,
    )
  })

  it("a permission error on pass stays a plain ChannelError (only take is a 'refusal')", async () => {
    server.use(
      http.post(PASS_URL, () =>
        HttpResponse.json(
          { error: { message: "(#10) Permission denied", code: 10 } },
          { status: 400 },
        ),
      ),
    )

    const error = await updateThreadControl("pass").catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ChannelError)
    expect(error).not.toBeInstanceOf(ThreadControlTakeRefusedError)
  })

  it("a contact without a PSID is rejected before any call", async () => {
    await expect(
      conversationHandlers.updateThreadControl({
        ctx,
        data: { contact: { id: "ci-1", sourceId: null }, action: "take" },
      } as never),
    ).rejects.toThrow("Missing recipient ID")
  })
})

const handoverBody = (
  key: "pass_thread_control" | "take_thread_control",
  payload: Record<string, unknown>,
) => ({
  sender: { id: PSID },
  recipient: { id: "page-1" },
  timestamp: 1_755_694_800_750,
  [key]: payload,
})

const receive = (kind: string, body: unknown) =>
  conversationHandlers.receiveThreadControlEvent({
    ctx,
    data: {
      integrationType: "messenger",
      integrationIdentifier: "page-1",
      payload: { kind, body },
    },
  } as never)

describe("receiveThreadControlEvent", () => {
  it("a Business-AI -> us pass is resume-eligible and keeps both app ids", async () => {
    const result = await receive(
      "handover",
      handoverBody("pass_thread_control", {
        previous_owner_app_id: BOT_APP,
        new_owner_app_id: OWN_APP,
      }),
    )

    expect(result).toMatchObject({
      kind: "handover",
      event: {
        event: "controlPassed",
        previousOwnerAppId: BOT_APP,
        newOwnerAppId: OWN_APP,
        resumeEligible: true,
        occurredAt: new Date(1_755_694_800_000),
      },
    })
  })

  it("a handover whose new owner is the Business-AI app records the ai_agent role", async () => {
    const result = await receive(
      "handover",
      handoverBody("pass_thread_control", {
        previous_owner_app_id: OWN_APP,
        new_owner_app_id: BOT_APP,
      }),
    )

    expect(result).toMatchObject({
      kind: "handover",
      event: { newOwnerAppId: BOT_APP, newOwnerRole: "ai_agent" },
    })
  })

  it("a handover to a non-Business-AI partner keeps a null new owner role", async () => {
    const result = await receive(
      "handover",
      handoverBody("pass_thread_control", {
        previous_owner_app_id: OWN_APP,
        new_owner_app_id: PARTNER_APP,
      }),
    )

    expect(result).toMatchObject({
      kind: "handover",
      event: { newOwnerAppId: PARTNER_APP, newOwnerRole: null },
    })
  })

  it("a pass from another partner to us IS resume-eligible", async () => {
    const result = await receive(
      "handover",
      handoverBody("pass_thread_control", {
        previous_owner_app_id: PARTNER_APP,
        new_owner_app_id: OWN_APP,
      }),
    )

    expect(result).toMatchObject({
      kind: "handover",
      event: { event: "controlPassed" },
    })
    // Any partner handing control back to us (the primary receiver) resumes.
    expect(result?.kind === "handover" && result.event.resumeEligible).toBe(
      true,
    )
  })

  it("a pass to us with no previous owner (Meta omits it) is eligible", async () => {
    const result = await receive(
      "handover",
      handoverBody("pass_thread_control", { new_owner_app_id: OWN_APP }),
    )

    expect(result?.kind === "handover" && result.event.resumeEligible).toBe(
      true,
    )
  })

  it("another app taking the thread from us is a controlTaken and never resumes", async () => {
    const result = await receive(
      "handover",
      handoverBody("take_thread_control", {
        previous_owner_app_id: OWN_APP,
        new_owner_app_id: PARTNER_APP,
      }),
    )

    expect(result).toMatchObject({
      kind: "handover",
      event: { event: "controlTaken", newOwnerAppId: PARTNER_APP },
    })
    expect(
      result?.kind === "handover" && result.event.resumeEligible,
    ).toBeFalsy()
  })

  it("a pass naming ANOTHER app as new owner means someone else holds it: recorded as controlTaken, never resumes", async () => {
    const result = await receive(
      "handover",
      handoverBody("pass_thread_control", {
        previous_owner_app_id: BOT_APP,
        new_owner_app_id: PARTNER_APP,
      }),
    )

    expect(result).toMatchObject({
      kind: "handover",
      event: { event: "controlTaken", newOwnerAppId: PARTNER_APP },
    })
    expect(
      result?.kind === "handover" && result.event.resumeEligible,
    ).toBeFalsy()
  })

  it("a take that names us as the new owner means we hold it: controlPassed but not resume-eligible", async () => {
    const result = await receive(
      "handover",
      handoverBody("take_thread_control", {
        previous_owner_app_id: BOT_APP,
        new_owner_app_id: OWN_APP,
      }),
    )

    expect(result).toMatchObject({
      kind: "handover",
      event: { event: "controlPassed" },
    })
    expect(
      result?.kind === "handover" && result.event.resumeEligible,
    ).toBeFalsy()
  })

  it("maps a thread request and app_roles to their own kinds", async () => {
    expect(
      await receive("handoverRequest", {
        sender: { id: PSID },
        timestamp: 1_755_694_800_750,
        request_thread_control: { requested_owner_app_id: PARTNER_APP },
      }),
    ).toMatchObject({
      kind: "handoverRequest",
      event: { requestedOwnerAppId: PARTNER_APP },
    })

    expect(
      await receive("appRoles", {
        recipient: { id: "page-1" },
        timestamp: 1_755_694_800_750,
        app_roles: { [OWN_APP]: ["primary_receiver"] },
      }),
    ).toMatchObject({
      kind: "appRoles",
      event: {
        accountId: "page-1",
        roles: { [OWN_APP]: ["primary_receiver"] },
      },
    })
  })

  it("forwards a standby message body unchanged, drops one with no standby item and any malformed payload", async () => {
    const body = {
      object: "page",
      entry: [
        {
          id: "page-1",
          time: 1,
          standby: [
            {
              sender: { id: PSID },
              recipient: { id: "page-1" },
              timestamp: 1,
              message: { mid: "m1", text: "hi" },
            },
          ],
        },
      ],
    }
    expect(await receive("standbyMessage", body)).toEqual({
      kind: "standbyMessage",
      receivePayload: body,
    })
    expect(await receive("standbyMessage", { entry: [] })).toBeNull()
    expect(await receive("handover", { nonsense: true })).toBeNull()
    expect(
      await conversationHandlers.receiveThreadControlEvent({
        ctx,
        data: {
          integrationType: "messenger",
          integrationIdentifier: "page-1",
          payload: "garbage",
        },
      } as never),
    ).toBeNull()
  })
})

describe("isResumeEligibleHandover", () => {
  const event = {
    contact: { sourceId: PSID },
    event: "controlPassed" as const,
    previousOwnerRole: null,
    newOwnerRole: null,
    previousOwnerAppId: BOT_APP,
    newOwnerAppId: OWN_APP,
    occurredAt: new Date(0),
  }

  it("accepts any previous owner — Business-AI, another partner, or absent", () => {
    const ids = { ownAppId: OWN_APP }
    expect(
      isResumeEligibleHandover(
        { ...event, previousOwnerAppId: undefined },
        ids,
      ),
    ).toBe(true)
    expect(
      isResumeEligibleHandover({ ...event, previousOwnerAppId: null }, ids),
    ).toBe(true)
    expect(
      isResumeEligibleHandover(
        { ...event, previousOwnerAppId: PARTNER_APP },
        ids,
      ),
    ).toBe(true)
  })

  it("requires our own app id to be known and to match the new owner", () => {
    expect(isResumeEligibleHandover(event, { ownAppId: OWN_APP })).toBe(true)
    expect(isResumeEligibleHandover(event, { ownAppId: null })).toBe(false)
    expect(
      isResumeEligibleHandover(
        { ...event, newOwnerAppId: PARTNER_APP },
        { ownAppId: OWN_APP },
      ),
    ).toBe(false)
    expect(
      isResumeEligibleHandover(
        { ...event, event: "controlTaken" },
        { ownAppId: OWN_APP },
      ),
    ).toBe(false)
  })
})

describe("getThreadOwner", () => {
  const OWNER_URL = `${BASE}/${DEFAULT_API_VERSION}/me/thread_owner`

  const getThreadOwner = () =>
    conversationHandlers.getThreadOwner({
      ctx,
      data: { contact: { id: "ci-1", sourceId: PSID } },
    } as never)

  const answer = (body: unknown) => {
    const seen: { recipient: string | null; auth: string | null }[] = []
    server.use(
      http.get(OWNER_URL, ({ request }) => {
        seen.push({
          recipient: new URL(request.url).searchParams.get("recipient"),
          auth: request.headers.get("authorization"),
        })
        return HttpResponse.json(body)
      }),
    )
    return seen
  }

  it("parses data[0].thread_owner.{app_id,expiration} and reports the identities", async () => {
    const seen = answer({
      data: [
        { thread_owner: { app_id: "app-partner", expiration: 1_755_694_800 } },
      ],
    })

    const result = await getThreadOwner()

    expect(seen).toEqual([{ recipient: PSID, auth: "Bearer PAGE_TOKEN" }])
    expect(result).toEqual({
      ownerAppId: PARTNER_APP,
      expiresAt: new Date(1_755_694_800_000),
      ownAppId: OWN_APP,
      businessAiAppId: BOT_APP,
    })
  })

  it("coerces a numeric app id to a string", async () => {
    answer({ data: [{ thread_owner: { app_id: 123_456 } }] })

    const result = await getThreadOwner()

    expect(result).toMatchObject({ ownerAppId: "123456" })
  })

  it("tolerates a missing or invalid expiration", async () => {
    answer({ data: [{ thread_owner: { app_id: "a-1" } }] })
    expect(await getThreadOwner()).toMatchObject({
      ownerAppId: "a-1",
      expiresAt: null,
    })

    answer({ data: [{ thread_owner: { app_id: "a-1", expiration: "junk" } }] })
    expect(await getThreadOwner()).toMatchObject({ expiresAt: null })
  })

  it("an empty data array means no owner", async () => {
    answer({ data: [] })

    expect(await getThreadOwner()).toMatchObject({
      ownerAppId: null,
      expiresAt: null,
    })
  })

  it("throws on a malformed body instead of reporting no owner", async () => {
    // A 200 body with no `data` (e.g. an error envelope) is unavailable, not a
    // validated empty answer — it must throw so a reconcile never clears a
    // known owner off an unparseable response.
    answer({ error: { message: "temporarily unavailable" } })

    await expect(getThreadOwner()).rejects.toThrow()
  })
})
