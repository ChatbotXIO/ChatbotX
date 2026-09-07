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
import { resolveOwningWabaId } from "../src/api/waba-owner"

const PHONE_NUMBERS_PATH_RE = /\/([^/?]+)\/phone_numbers/
const ASSIGNED_USERS_PATH_RE = /\/([^/?]+)\/assigned_users/

type ProbeOptions = {
  searchParams?: Record<string, string>
  headers?: Record<string, string>
}

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

const phoneNumbersBody = (ids: string[]) => ({
  data: ids.map((id) => ({ id })),
})

const wabaNodeBody = (id: string) => ({
  id,
  metadata: { type: "whatsapp_business_account" },
})

/**
 * Routes the mocked `ky.get` by URL so the resolver's read surfaces
 * (`/debug_token`, the node probe, `/{id}/phone_numbers`) can be scripted
 * independently of call order — the resolver fans probes out in parallel —
 * and the mocked `ky.post` for the `/{id}/assigned_users` assignment.
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
    // ky rejects the request promise itself on a non-2xx; the resolver never
    // reads the body, so a rejected `.json()` alone would go unnoticed.
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

const resolve = (phoneNumberIds?: string[]) =>
  resolveOwningWabaId({
    accessToken: "user-token",
    appAccessToken: "app-id|app-secret",
    version: "v23.0",
    systemUserToken: "system-token-1",
    systemUserId: "system-user-1",
    phoneNumberIds,
  })

afterEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe("resolveOwningWabaId", () => {
  it("returns the sole granted target without probing it", async () => {
    routeGraph({ debugToken: debugTokenBody(["waba-1"]) })

    await expect(resolve()).resolves.toBe("waba-1")
    expect(getMock).toHaveBeenCalledTimes(1)
  })

  it("returns null when the token grants no whatsapp_business_management target", async () => {
    routeGraph({ debugToken: debugTokenBody([]) })

    await expect(resolve()).resolves.toBeNull()
  })

  it("skips a target whose node type is not a WhatsApp Business Account", async () => {
    routeGraph({
      debugToken: debugTokenBody(["not-a-waba", "waba-2"]),
      node: {
        "not-a-waba": {
          id: "not-a-waba",
          metadata: { type: "whatsapp_account" },
        },
        "waba-2": wabaNodeBody("waba-2"),
      },
    })

    await expect(resolve(["phone-1"])).resolves.toBe("waba-2")
  })

  it("treats a node probe that errors as not a WABA instead of throwing", async () => {
    routeGraph({
      debugToken: debugTokenBody(["coexist-node", "waba-2"]),
      node: {
        "coexist-node": new Error("Unsupported get request"),
        "waba-2": wabaNodeBody("waba-2"),
      },
    })

    await expect(resolve()).resolves.toBe("waba-2")
  })

  it("falls back to owner_business_info when Graph answers without a metadata block", async () => {
    routeGraph({
      debugToken: debugTokenBody(["node-1", "node-2"]),
      node: {
        "node-1": { id: "node-1" },
        "node-2": { id: "node-2", owner_business_info: { id: "business-1" } },
      },
    })

    await expect(resolve()).resolves.toBe("node-2")
  })

  it("picks the WABA that owns the requested phone number, not the first one", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1", "waba-2"]),
      node: {
        "waba-1": wabaNodeBody("waba-1"),
        "waba-2": wabaNodeBody("waba-2"),
      },
      phoneNumbers: {
        "waba-1": phoneNumbersBody(["phone-other"]),
        "waba-2": phoneNumbersBody(["phone-1", "phone-2"]),
      },
    })

    await expect(resolve(["phone-1"])).resolves.toBe("waba-2")
  })

  it("treats a phone-number listing error as an empty list", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1", "waba-2"]),
      node: {
        "waba-1": wabaNodeBody("waba-1"),
        "waba-2": wabaNodeBody("waba-2"),
      },
      phoneNumbers: {
        "waba-1": new Error("WhatsApp accounts cannot be used with this API"),
        "waba-2": phoneNumbersBody(["phone-1"]),
      },
    })

    await expect(resolve(["phone-1"])).resolves.toBe("waba-2")
  })

  it("keeps Meta's order when the request names none — the first granted WABA is this login's choice", async () => {
    routeGraph({
      debugToken: debugTokenBody(["store-waba", "agency-waba"]),
      node: {
        "store-waba": wabaNodeBody("store-waba"),
        "agency-waba": wabaNodeBody("agency-waba"),
      },
      phoneNumbers: {
        "store-waba": phoneNumbersBody(["store-phone"]),
        "agency-waba": phoneNumbersBody(["phone-1", "phone-2", "phone-3"]),
      },
    })

    // Live shape: the just-selected "BNN Store" (1 number) was listed ahead
    // of "Banana Agency" (3 numbers); holding more numbers must not win.
    await expect(resolve()).resolves.toBe("store-waba")
    expect(postMock).toHaveBeenCalledTimes(1)
  })

  it("steps over a shadow twin listed first and never probes the WABAs behind the accepted one", async () => {
    routeGraph({
      debugToken: debugTokenBody([
        "store-shadow",
        "store-waba",
        "agency-waba",
        "agency-shadow",
      ]),
      node: {
        "store-shadow": wabaNodeBody("store-shadow"),
        "store-waba": wabaNodeBody("store-waba"),
        "agency-waba": wabaNodeBody("agency-waba"),
        "agency-shadow": wabaNodeBody("agency-shadow"),
      },
      phoneNumbers: {
        "store-shadow": phoneNumbersBody(["store-phone"]),
        "store-waba": phoneNumbersBody(["store-phone"]),
        "agency-waba": phoneNumbersBody(["phone-1", "phone-2", "phone-3"]),
        "agency-shadow": phoneNumbersBody(["phone-1", "phone-2", "phone-3"]),
      },
      assignedUsers: {
        "store-shadow": whatsappAccountMisuseError(),
        "agency-shadow": whatsappAccountMisuseError(),
      },
    })

    await expect(resolve()).resolves.toBe("store-waba")
    expect(postMock).toHaveBeenCalledTimes(2)
  })

  it("returns null when no WABA owns the requested phone number", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1", "waba-2"]),
      node: {
        "waba-1": wabaNodeBody("waba-1"),
        "waba-2": wabaNodeBody("waba-2"),
      },
      phoneNumbers: {
        "waba-1": phoneNumbersBody(["phone-other"]),
        "waba-2": phoneNumbersBody(["phone-another"]),
      },
    })

    await expect(resolve(["phone-1"])).resolves.toBeNull()
  })

  it("skips the phone-number listing when only one target classifies as a WABA", async () => {
    routeGraph({
      debugToken: debugTokenBody(["coexist-node", "waba-2"]),
      node: {
        "coexist-node": {
          id: "coexist-node",
          metadata: { type: "whatsapp_account" },
        },
        "waba-2": wabaNodeBody("waba-2"),
      },
    })

    await expect(resolve(["phone-1"])).resolves.toBe("waba-2")
    // 1 debug_token + 2 node probes, no /phone_numbers call.
    expect(getMock).toHaveBeenCalledTimes(3)
  })
  it("prefers the target the capability probe accepts when both own the numbers", async () => {
    routeGraph({
      debugToken: debugTokenBody(["coexist-waba", "real-waba"]),
      node: {
        "coexist-waba": wabaNodeBody("coexist-waba"),
        "real-waba": wabaNodeBody("real-waba"),
      },
      phoneNumbers: {
        "coexist-waba": phoneNumbersBody(["phone-1"]),
        "real-waba": phoneNumbersBody(["phone-1"]),
      },
      assignedUsers: {
        "coexist-waba": whatsappAccountMisuseError(),
        "real-waba": { data: [] },
      },
    })

    await expect(resolve(["phone-1"])).resolves.toBe("real-waba")
  })

  it("prefers the accepted target whichever order Meta lists it in", async () => {
    routeGraph({
      debugToken: debugTokenBody(["real-waba", "coexist-waba"]),
      node: {
        "coexist-waba": wabaNodeBody("coexist-waba"),
        "real-waba": wabaNodeBody("real-waba"),
      },
      phoneNumbers: {
        "coexist-waba": phoneNumbersBody(["phone-1"]),
        "real-waba": phoneNumbersBody(["phone-1"]),
      },
      assignedUsers: {
        "coexist-waba": whatsappAccountMisuseError(),
        "real-waba": { data: [] },
      },
    })

    await expect(resolve(["phone-1"])).resolves.toBe("real-waba")
  })

  it("excludes a target rejected by error_user_title alone", async () => {
    routeGraph({
      debugToken: debugTokenBody(["coexist-waba", "real-waba"]),
      node: {
        "coexist-waba": wabaNodeBody("coexist-waba"),
        "real-waba": wabaNodeBody("real-waba"),
      },
      phoneNumbers: {
        "coexist-waba": phoneNumbersBody(["phone-1"]),
        "real-waba": phoneNumbersBody(["phone-1"]),
      },
      assignedUsers: {
        "coexist-waba": graphError({
          code: 100,
          error_user_title: "Invalid WhatsApp account usage",
        }),
        "real-waba": { data: [] },
      },
    })

    await expect(resolve(["phone-1"])).resolves.toBe("real-waba")
  })

  it("keeps a target whose capability probe fails for an unrelated reason", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1", "waba-2"]),
      node: {
        "waba-1": wabaNodeBody("waba-1"),
        "waba-2": wabaNodeBody("waba-2"),
      },
      phoneNumbers: {
        "waba-1": phoneNumbersBody(["phone-1", "phone-2"]),
        "waba-2": phoneNumbersBody(["phone-1"]),
      },
      assignedUsers: {
        "waba-1": graphError({ code: 1, message: "Please reduce the amount" }),
        "waba-2": { data: [] },
      },
    })

    // waba-1 keeps the higher ownership score: a transient probe failure
    // must not hand the connect to the other candidate.
    await expect(resolve()).resolves.toBe("waba-1")
  })

  it("keeps the first-listed target when its probe is merely undecided", async () => {
    routeGraph({
      debugToken: debugTokenBody(["chosen-waba", "other-waba"]),
      node: {
        "chosen-waba": wabaNodeBody("chosen-waba"),
        "other-waba": wabaNodeBody("other-waba"),
      },
      phoneNumbers: {
        "chosen-waba": phoneNumbersBody(["phone-1"]),
        "other-waba": phoneNumbersBody(["phone-1"]),
      },
      assignedUsers: {
        "chosen-waba": graphError({
          code: 1,
          message: "Please reduce the amount",
        }),
        "other-waba": { data: [] },
      },
    })

    // A throttle on the user's own choice must not hand the connect to the
    // next target; only a positive 2388339 refusal steps over a target.
    await expect(resolve(["phone-1"])).resolves.toBe("chosen-waba")
    expect(postMock).toHaveBeenCalledTimes(1)
  })

  it("returns null when the capability probe rejects every owning target", async () => {
    routeGraph({
      debugToken: debugTokenBody(["coexist-a", "coexist-b"]),
      node: {
        "coexist-a": wabaNodeBody("coexist-a"),
        "coexist-b": wabaNodeBody("coexist-b"),
      },
      phoneNumbers: {
        "coexist-a": phoneNumbersBody(["phone-1"]),
        "coexist-b": phoneNumbersBody(["phone-1"]),
      },
      assignedUsers: {
        "coexist-a": whatsappAccountMisuseError(),
        "coexist-b": whatsappAccountMisuseError(),
      },
    })

    await expect(resolve(["phone-1"])).resolves.toBeNull()
  })

  it("does not probe capability when a single owning WABA survives", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1", "waba-2"]),
      node: {
        "waba-1": wabaNodeBody("waba-1"),
        "waba-2": wabaNodeBody("waba-2"),
      },
      phoneNumbers: {
        "waba-1": phoneNumbersBody(["phone-other"]),
        "waba-2": phoneNumbersBody(["phone-1"]),
      },
    })

    await expect(resolve(["phone-1"])).resolves.toBe("waba-2")
    // 1 debug_token + 2 node probes + 2 phone listings, no assignment.
    expect(getMock).toHaveBeenCalledTimes(5)
    expect(postMock).not.toHaveBeenCalled()
  })

  it("sends the introspection probe with the user token", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1", "waba-2"]),
      node: {
        "waba-1": wabaNodeBody("waba-1"),
        "waba-2": wabaNodeBody("waba-2"),
      },
      phoneNumbers: {
        "waba-1": phoneNumbersBody(["phone-1"]),
        "waba-2": phoneNumbersBody([]),
      },
    })

    await resolve(["phone-1"])

    const probeCall = getMock.mock.calls.find(([url]) =>
      String(url).endsWith("/v23.0/waba-1"),
    ) as [string, ProbeOptions] | undefined
    expect(probeCall?.[1].searchParams).toMatchObject({
      metadata: "1",
      fields: "id,owner_business_info",
    })
    expect(probeCall?.[1].headers).toMatchObject({
      Authorization: "Bearer user-token",
    })
  })

  it("performs the system-user assignment exactly as the connect does", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1", "waba-2"]),
      node: {
        "waba-1": wabaNodeBody("waba-1"),
        "waba-2": wabaNodeBody("waba-2"),
      },
      phoneNumbers: {
        "waba-1": phoneNumbersBody(["phone-1"]),
        "waba-2": phoneNumbersBody(["phone-1"]),
      },
    })

    await resolve(["phone-1"])

    const probeCall = postMock.mock.calls.find(([url]) =>
      String(url).endsWith("/v23.0/waba-1/assigned_users"),
    ) as [string, ProbeOptions] | undefined
    expect(probeCall?.[1].searchParams).toEqual({
      user: "system-user-1",
      tasks: "MANAGE",
    })
    expect(probeCall?.[1].headers).toMatchObject({
      Authorization: "Bearer system-token-1",
    })
  })

  it("stops probing at the first accepted candidate", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1", "waba-2"]),
      node: {
        "waba-1": wabaNodeBody("waba-1"),
        "waba-2": wabaNodeBody("waba-2"),
      },
      phoneNumbers: {
        "waba-1": phoneNumbersBody(["phone-1"]),
        "waba-2": phoneNumbersBody(["phone-1"]),
      },
    })

    await expect(resolve(["phone-1"])).resolves.toBe("waba-1")
    expect(postMock).toHaveBeenCalledTimes(1)
  })

  it("exhausts the better-owning bucket before probing a worse one", async () => {
    routeGraph({
      debugToken: debugTokenBody(["coexist-waba", "real-waba", "other-waba"]),
      node: {
        "coexist-waba": wabaNodeBody("coexist-waba"),
        "real-waba": wabaNodeBody("real-waba"),
        "other-waba": wabaNodeBody("other-waba"),
      },
      phoneNumbers: {
        "coexist-waba": phoneNumbersBody(["phone-1", "phone-2"]),
        "real-waba": phoneNumbersBody(["phone-1", "phone-2"]),
        "other-waba": phoneNumbersBody(["phone-1"]),
      },
      assignedUsers: {
        "coexist-waba": whatsappAccountMisuseError(),
      },
    })

    await expect(resolve(["phone-1", "phone-2"])).resolves.toBe("real-waba")
    expect(postMock).toHaveBeenCalledTimes(2)
  })

  it("moves to the next score bucket when the best one is rejected outright", async () => {
    routeGraph({
      debugToken: debugTokenBody(["coexist-waba", "real-waba"]),
      node: {
        "coexist-waba": wabaNodeBody("coexist-waba"),
        "real-waba": wabaNodeBody("real-waba"),
      },
      phoneNumbers: {
        "coexist-waba": phoneNumbersBody(["phone-1", "phone-2"]),
        "real-waba": phoneNumbersBody(["phone-1"]),
      },
      assignedUsers: {
        "coexist-waba": whatsappAccountMisuseError(),
      },
    })

    await expect(resolve(["phone-1", "phone-2"])).resolves.toBe("real-waba")
    expect(postMock).toHaveBeenCalledTimes(2)
  })

  it("treats an empty-bodied 2xx assignment as accepted", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1", "waba-2"]),
      node: {
        "waba-1": wabaNodeBody("waba-1"),
        "waba-2": wabaNodeBody("waba-2"),
      },
      phoneNumbers: {
        "waba-1": phoneNumbersBody(["phone-1"]),
        "waba-2": phoneNumbersBody(["phone-1"]),
      },
    })
    // A ky response whose `.json()` would throw on an empty body.
    postMock.mockImplementation(() => ({
      json: vi
        .fn()
        .mockRejectedValue(new SyntaxError("Unexpected end of JSON")),
    }))

    await expect(resolve(["phone-1"])).resolves.toBe("waba-1")
    expect(postMock).toHaveBeenCalledTimes(1)
  })

  it("falls back to the ownership score when the system user is not configured", async () => {
    routeGraph({
      debugToken: debugTokenBody(["waba-1", "waba-2"]),
      node: {
        "waba-1": wabaNodeBody("waba-1"),
        "waba-2": wabaNodeBody("waba-2"),
      },
      phoneNumbers: {
        "waba-1": phoneNumbersBody(["phone-1"]),
        "waba-2": phoneNumbersBody(["phone-1", "phone-2"]),
      },
    })

    await expect(
      resolveOwningWabaId({
        accessToken: "user-token",
        appAccessToken: "app-id|app-secret",
        version: "v23.0",
        phoneNumberIds: ["phone-1", "phone-2"],
      }),
    ).resolves.toBe("waba-2")
    expect(postMock).not.toHaveBeenCalled()
  })
})
