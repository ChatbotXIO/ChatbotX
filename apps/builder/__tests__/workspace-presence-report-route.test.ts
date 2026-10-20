// @vitest-environment node

import {
  signMemberConnectToken,
  signPresenceReportToken,
} from "@chatbotx.io/realtime-protocol/auth"
import { hashPresenceUserIds } from "@chatbotx.io/realtime-protocol/presence"
import { beforeEach, describe, expect, test, vi } from "vitest"

const SECRET = "a".repeat(32)

const mocks = vi.hoisted(() => ({
  heartbeatMany: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspacePresenceService: { heartbeatMany: mocks.heartbeatMany },
}))

vi.mock("@/env", () => ({
  env: { REALTIME_BROADCAST_SECRET: SECRET },
}))

vi.mock("@/lib/log", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}))

const { POST } = await import("../src/app/api/workspace-presence/report/route")

async function signPresenceToken(input: {
  workspaceId: string
  userIds: string[]
  secret?: string
}): Promise<string> {
  const bodyHash = await hashPresenceUserIds(input.userIds)
  return await signPresenceReportToken(
    { workspaceId: input.workspaceId, bodyHash },
    input.secret ?? SECRET,
  )
}

/** Mints a token with NO `purpose` claim at all — `signRealtimeToken`
 * always sets one, so this uses the raw `jose` primitive directly to prove
 * a token that predates/omits the claim is rejected too, not just a
 * mismatched one. */
async function signPresenceTokenWithNoPurposeClaim(input: {
  workspaceId: string
  userIds: string[]
}): Promise<string> {
  // Signed by hand with Web Crypto rather than `signRealtimeToken`, which
  // always stamps `purpose` — the one claim this token must lack.
  const nowSeconds = Math.floor(Date.now() / 1000)
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url")
  const signingInput = `${encode({ alg: "HS256" })}.${encode({
    bodyHash: await hashPresenceUserIds(input.userIds),
    aud: `workspace:${input.workspaceId}`,
    iat: nowSeconds,
    exp: nowSeconds + 60,
  })}`
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`
}

function makeRequest(
  workspaceId: string | null,
  body: unknown,
  authorization?: string,
): Parameters<typeof POST>[0] {
  const url = new URL("http://localhost/api/workspace-presence/report")
  if (workspaceId !== null) {
    url.searchParams.set("workspaceId", workspaceId)
  }
  return new Request(url.toString(), {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : {},
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.heartbeatMany.mockResolvedValue(undefined)
})

describe("POST /api/workspace-presence/report", () => {
  test.each([
    {
      createRequest: async () => makeRequest("1", { userIds: ["2"] }),
      name: "no bearer token",
    },
    {
      createRequest: async () =>
        new Request(
          "http://localhost/api/workspace-presence/report?workspaceId=1",
          {
            method: "POST",
            headers: { Authorization: "Bearer garbage-token" },
            body: "{not json",
          },
        ) as unknown as Parameters<typeof POST>[0],
      name: "a malformed body with an invalid signature",
    },
    {
      createRequest: async () => {
        const token = await signPresenceToken({
          workspaceId: "other-workspace",
          userIds: ["2"],
        })
        return makeRequest("1", { userIds: ["2"] }, `Bearer ${token}`)
      },
      name: "a token minted for another workspace",
    },
    {
      createRequest: async () => {
        const token = await signMemberConnectToken(
          {
            workspaceId: "1",
            userId: "u_1",
            chatScope: "all",
            issuedAtMs: Date.now(),
          },
          SECRET,
        )
        return makeRequest("1", { userIds: ["2"] }, `Bearer ${token}`)
      },
      name: "a member-connect token with the wrong purpose",
    },
    {
      createRequest: async () => {
        const token = await signPresenceTokenWithNoPurposeClaim({
          workspaceId: "1",
          userIds: ["2"],
        })
        return makeRequest("1", { userIds: ["2"] }, `Bearer ${token}`)
      },
      name: "a token with no purpose claim",
    },
    {
      createRequest: async () => {
        const token = await signPresenceToken({
          workspaceId: "1",
          userIds: ["2"],
          secret: "b".repeat(32),
        })
        return makeRequest("1", { userIds: ["2"] }, `Bearer ${token}`)
      },
      name: "a token signed with another secret",
    },
    {
      createRequest: async () => {
        const token = await signPresenceToken({
          workspaceId: "1",
          userIds: ["2", "3"],
        })
        return makeRequest("1", { userIds: ["2", "4"] }, `Bearer ${token}`)
      },
      name: "a request body that does not match the token hash",
    },
  ])("rejects with 401 for $name", async ({ createRequest }) => {
    const response = await POST(await createRequest())

    expect(response.status).toBe(401)
    expect(mocks.heartbeatMany).not.toHaveBeenCalled()
  })

  test.each([
    {
      createRequest: async () =>
        makeRequest(null, { userIds: ["2"] }, "Bearer whatever"),
      name: "a missing workspaceId query parameter",
    },
    {
      createRequest: async () =>
        makeRequest("not-a-bigint", { userIds: ["2"] }, "Bearer whatever"),
      name: "a malformed workspaceId query parameter",
    },
    {
      createRequest: async () => {
        const token = await signPresenceToken({ workspaceId: "1", userIds: [] })
        return makeRequest("1", { userIds: "not-an-array" }, `Bearer ${token}`)
      },
      name: "an invalid request body",
    },
  ])("rejects with 400 for $name", async ({ createRequest }) => {
    const response = await POST(await createRequest())

    expect(response.status).toBe(400)
    expect(mocks.heartbeatMany).not.toHaveBeenCalled()
  })

  test("a valid token with matching workspace, purpose, and bodyHash calls heartbeatMany and returns 200", async () => {
    const userIds = ["2", "3"]
    const token = await signPresenceToken({ workspaceId: "1", userIds })

    const response = await POST(
      makeRequest("1", { userIds }, `Bearer ${token}`),
    )

    expect(mocks.heartbeatMany).toHaveBeenCalledWith({
      workspaceId: "1",
      userIds,
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  test("truncates an over-cap userIds batch instead of rejecting it, and matches the token hashed over the same truncated set (LOW-7)", async () => {
    const { MAX_PRESENCE_USER_IDS_PER_REPORT } = await import(
      "@chatbotx.io/realtime-protocol/presence"
    )
    const overCapUserIds = Array.from(
      { length: MAX_PRESENCE_USER_IDS_PER_REPORT + 5 },
      (_, i) => String(i + 1),
    )
    const truncatedUserIds = overCapUserIds.slice(
      0,
      MAX_PRESENCE_USER_IDS_PER_REPORT,
    )
    // The realtime side always truncates before signing/sending, so the
    // token is bound to the ALREADY-truncated set — this asserts the route
    // matches that exact behaviour rather than hashing the raw body.
    const token = await signPresenceToken({
      workspaceId: "1",
      userIds: truncatedUserIds,
    })

    const response = await POST(
      makeRequest("1", { userIds: overCapUserIds }, `Bearer ${token}`),
    )

    expect(response.status).toBe(200)
    expect(mocks.heartbeatMany).toHaveBeenCalledWith({
      workspaceId: "1",
      userIds: truncatedUserIds,
    })
  })

  test("an unexpected heartbeatMany error is logged with err and answered without a 5xx retry storm", async () => {
    const userIds = ["2"]
    const token = await signPresenceToken({ workspaceId: "1", userIds })
    mocks.heartbeatMany.mockRejectedValue(new Error("unexpected"))

    const response = await POST(
      makeRequest("1", { userIds }, `Bearer ${token}`),
    )

    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
    expect(mocks.loggerError.mock.calls[0]?.[0]).toMatchObject({
      err: expect.any(Error),
    })
    expect(response.status).toBeLessThan(500)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })
})
