import { afterEach, describe, expect, it, vi } from "vitest"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { get: getMock, post: postMock },
    HTTPError: actual.HTTPError,
  }
})

import { HTTPError } from "ky"
import { resolveBusinessAppCandidates } from "../src/api/waba-candidates"

const PHONE_NUMBERS_PATH_RE = /\/([^/?]+)\/phone_numbers/
const ASSIGNED_USERS_PATH_RE = /\/([^/?]+)\/assigned_users/

const okResponse = (body: unknown) => ({
  json: vi.fn().mockResolvedValue(body),
})

const failedResponse = (error: unknown) => ({
  json: vi.fn().mockRejectedValue(error),
})

/** A Graph failure in the shape ky throws it, so `parseOriginError` reads it. */
const graphError = (error: Record<string, unknown>) => {
  const httpError = new HTTPError(
    new Response(null, { status: 400 }),
    new Request("https://graph.facebook.com/v23.0/probe"),
    {} as ConstructorParameters<typeof HTTPError>[2],
  )
  httpError.data = { error }
  return httpError
}

const whatsappAccountMisuseError = () =>
  graphError({
    code: 100,
    error_subcode: 2_388_339,
    message: "WhatsApp accounts cannot be used with this API",
  })

const debugTokenBody = (targetIds: string[]) => ({
  data: {
    app_id: "app-1",
    is_valid: true,
    user_id: "user-1",
    granular_scopes: [
      { scope: "whatsapp_business_management", target_ids: targetIds },
    ],
  },
})

type PhoneNumberFixture = {
  id: string
  isOnBizApp?: boolean
}

const phoneNumbersBody = (phoneNumbers: PhoneNumberFixture[]) => ({
  data: phoneNumbers.map((phoneNumber) => ({
    id: phoneNumber.id,
    verified_name: `Name ${phoneNumber.id}`,
    display_phone_number: `+84 ${phoneNumber.id}`,
    code_verification_status: "VERIFIED",
    quality_rating: "GREEN",
    platform_type: "CLOUD_API",
    throughput: {},
    webhook_configuration: {},
    is_on_biz_app: phoneNumber.isOnBizApp ?? false,
  })),
})

const wabaNodeBody = (id: string, businessId = `business-${id}`) => ({
  id,
  metadata: { type: "whatsapp_business_account" },
  owner_business_info: { id: businessId },
})

/**
 * Routes the mocked `ky.get` by URL so each read surface (`/debug_token`, the
 * node probe, `/{id}/phone_numbers`) can be scripted independently of call
 * order, and the mocked `ky.post` for the `/{id}/assigned_users` probe. Same
 * shape as `waba-owner.test.ts`'s router.
 */
function routeGraph(routes: {
  debugToken: unknown
  node?: Record<string, unknown>
  phoneNumbers?: Record<string, unknown>
  assignedUsers?: Record<string, unknown>
}) {
  postMock.mockImplementation((url: string) => {
    const assignedUsersMatch = url.match(ASSIGNED_USERS_PATH_RE)
    const body = assignedUsersMatch?.[1]
      ? routes.assignedUsers?.[assignedUsersMatch[1]]
      : undefined
    return body instanceof Error
      ? Promise.reject(body)
      : okResponse(body ?? { success: true })
  })

  getMock.mockImplementation((url: string) => {
    if (url.includes("/debug_token")) {
      return okResponse(routes.debugToken)
    }

    const phoneNumbersMatch = url.match(PHONE_NUMBERS_PATH_RE)
    if (phoneNumbersMatch?.[1]) {
      const body = routes.phoneNumbers?.[phoneNumbersMatch[1]]
      return body instanceof Error
        ? failedResponse(body)
        : okResponse(body ?? phoneNumbersBody([]))
    }

    const nodeId = new URL(url).pathname.split("/").filter(Boolean).pop() ?? ""
    const body = routes.node?.[nodeId]
    return body instanceof Error ? failedResponse(body) : okResponse(body ?? {})
  })
}

const resolve = () =>
  resolveBusinessAppCandidates({
    accessToken: "user-token",
    appAccessToken: "app-id|app-secret",
    version: "v23.0",
    systemUserToken: "system-token-1",
    systemUserId: "system-user-1",
  })

const candidateIds = (
  candidates: Awaited<ReturnType<typeof resolve>>,
): string[] => candidates.map((candidate) => candidate.phoneNumber.id)

afterEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe("resolveBusinessAppCandidates", () => {
  it("returns the Business App numbers of the only granted WABA", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1"]),
      node: { "waba-1": wabaNodeBody("waba-1") },
      phoneNumbers: {
        "waba-1": phoneNumbersBody([
          { id: "phone-cloud" },
          { id: "phone-biz", isOnBizApp: true },
        ]),
      },
    })

    const candidates = await resolve()

    expect(candidates).toEqual([
      expect.objectContaining({
        wabaId: "waba-1",
        businessId: "business-waba-1",
      }),
    ])
    expect(candidateIds(candidates)).toEqual(["phone-biz"])
  })

  it("ignores WABAs that hold only Cloud API numbers", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-cloud", "waba-biz"]),
      node: {
        "waba-cloud": wabaNodeBody("waba-cloud"),
        "waba-biz": wabaNodeBody("waba-biz"),
      },
      phoneNumbers: {
        "waba-cloud": phoneNumbersBody([
          { id: "phone-a" },
          { id: "phone-b" },
          { id: "phone-c" },
        ]),
        "waba-biz": phoneNumbersBody([{ id: "phone-biz", isOnBizApp: true }]),
      },
    })

    const candidates = await resolve()

    expect(candidateIds(candidates)).toEqual(["phone-biz"])
    expect(candidates[0]?.wabaId).toBe("waba-biz")
  })

  it("skips a target that does not classify as a WhatsApp Business Account", async () => {
    routeGraph({
      debugToken: debugTokenBody(["not-a-waba", "waba-biz"]),
      node: {
        "not-a-waba": {
          id: "not-a-waba",
          metadata: { type: "whatsapp_account" },
        },
        "waba-biz": wabaNodeBody("waba-biz"),
      },
      phoneNumbers: {
        "not-a-waba": phoneNumbersBody([
          { id: "phone-shadow", isOnBizApp: true },
        ]),
        "waba-biz": phoneNumbersBody([{ id: "phone-biz", isOnBizApp: true }]),
      },
    })

    expect(candidateIds(await resolve())).toEqual(["phone-biz"])
  })

  it("resolves a number listed by twin WABAs to the twin the probe accepts", async () => {
    routeGraph({
      debugToken: debugTokenBody(["shadow-waba", "real-waba"]),
      node: {
        "shadow-waba": wabaNodeBody("shadow-waba"),
        "real-waba": wabaNodeBody("real-waba"),
      },
      phoneNumbers: {
        "shadow-waba": phoneNumbersBody([
          { id: "phone-biz", isOnBizApp: true },
        ]),
        "real-waba": phoneNumbersBody([{ id: "phone-biz", isOnBizApp: true }]),
      },
      assignedUsers: {
        "shadow-waba": whatsappAccountMisuseError(),
        "real-waba": { data: [] },
      },
    })

    const candidates = await resolve()

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.wabaId).toBe("real-waba")
    expect(candidates[0]?.businessId).toBe("business-real-waba")
  })

  it("drops a number whose every owning WABA rejects the probe", async () => {
    routeGraph({
      debugToken: debugTokenBody(["shadow-a", "shadow-b"]),
      node: {
        "shadow-a": wabaNodeBody("shadow-a"),
        "shadow-b": wabaNodeBody("shadow-b"),
      },
      phoneNumbers: {
        "shadow-a": phoneNumbersBody([{ id: "phone-biz", isOnBizApp: true }]),
        "shadow-b": phoneNumbersBody([{ id: "phone-biz", isOnBizApp: true }]),
      },
      assignedUsers: {
        "shadow-a": whatsappAccountMisuseError(),
        "shadow-b": whatsappAccountMisuseError(),
      },
    })

    expect(await resolve()).toEqual([])
  })

  it("never probes a number owned by a single WABA", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1", "waba-2"]),
      node: {
        "waba-1": wabaNodeBody("waba-1"),
        "waba-2": wabaNodeBody("waba-2"),
      },
      phoneNumbers: {
        "waba-1": phoneNumbersBody([{ id: "phone-1", isOnBizApp: true }]),
        "waba-2": phoneNumbersBody([{ id: "phone-2", isOnBizApp: true }]),
      },
    })

    expect(candidateIds(await resolve())).toEqual(["phone-1", "phone-2"])
    expect(postMock).not.toHaveBeenCalled()
  })

  it("returns every Business App number — dropping the connected ones is the caller's job", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1"]),
      node: { "waba-1": wabaNodeBody("waba-1") },
      phoneNumbers: {
        "waba-1": phoneNumbersBody([
          { id: "phone-connected", isOnBizApp: true },
          { id: "phone-free", isOnBizApp: true },
        ]),
      },
    })

    expect(candidateIds(await resolve())).toEqual([
      "phone-connected",
      "phone-free",
    ])
  })

  it("keeps Meta's target order across several WABAs", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-2", "waba-1"]),
      node: {
        "waba-1": wabaNodeBody("waba-1"),
        "waba-2": wabaNodeBody("waba-2"),
      },
      phoneNumbers: {
        "waba-1": phoneNumbersBody([{ id: "phone-1", isOnBizApp: true }]),
        "waba-2": phoneNumbersBody([
          { id: "phone-2a", isOnBizApp: true },
          { id: "phone-2b", isOnBizApp: true },
        ]),
      },
    })

    expect(candidateIds(await resolve())).toEqual([
      "phone-2a",
      "phone-2b",
      "phone-1",
    ])
  })

  it("requests is_on_biz_app on the phone-number listing", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1"]),
      node: { "waba-1": wabaNodeBody("waba-1") },
      phoneNumbers: {
        "waba-1": phoneNumbersBody([{ id: "phone-biz", isOnBizApp: true }]),
      },
    })

    await resolve()

    const listingUrl = getMock.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes("/phone_numbers"))
    expect(listingUrl).toBeDefined()
    expect(new URL(listingUrl ?? "").searchParams.get("fields")).toContain(
      "is_on_biz_app",
    )
  })

  it("treats a phone-number listing failure as an empty WABA", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-broken", "waba-biz"]),
      node: {
        "waba-broken": wabaNodeBody("waba-broken"),
        "waba-biz": wabaNodeBody("waba-biz"),
      },
      phoneNumbers: {
        "waba-broken": new Error("Unsupported get request"),
        "waba-biz": phoneNumbersBody([{ id: "phone-biz", isOnBizApp: true }]),
      },
    })

    expect(candidateIds(await resolve())).toEqual(["phone-biz"])
  })

  it("returns nothing when the token grants no target", async () => {
    routeGraph({ debugToken: debugTokenBody([]) })

    expect(await resolve()).toEqual([])
  })

  it("falls back to an empty businessId when the WABA node has no owner", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1"]),
      node: {
        "waba-1": {
          id: "waba-1",
          metadata: { type: "whatsapp_business_account" },
        },
      },
      phoneNumbers: {
        "waba-1": phoneNumbersBody([{ id: "phone-biz", isOnBizApp: true }]),
      },
    })

    expect((await resolve())[0]?.businessId).toBe("")
  })
})
