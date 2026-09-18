// @vitest-environment node

import {
  REALTIME_TOKEN_PURPOSE,
  signRealtimeToken,
} from "@chatbotx.io/partysocket-config/auth"
import { hashPresenceUserIds } from "@chatbotx.io/partysocket-config/presence"
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
  purpose?: string
  secret?: string
}): Promise<string> {
  const bodyHash = await hashPresenceUserIds(input.userIds)
  return await signRealtimeToken(
    { kind: "workspace", id: input.workspaceId },
    (input.purpose ?? REALTIME_TOKEN_PURPOSE.presenceReport) as Parameters<
      typeof signRealtimeToken
    >[1],
    input.secret ?? SECRET,
    { bodyHash },
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
  const { SignJWT } = await import("jose")
  const bodyHash = await hashPresenceUserIds(input.userIds)
  return await new SignJWT({ bodyHash })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(`workspace:${input.workspaceId}`)
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(SECRET))
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
  test("rejects with 401 when there is no bearer token — never touches Redis", async () => {
    const response = await POST(makeRequest("1", { userIds: ["2"] }))

    expect(response.status).toBe(401)
    expect(mocks.heartbeatMany).not.toHaveBeenCalled()
  })

  test("rejects with 400 when the workspaceId query param is missing — before verifying/parsing anything", async () => {
    const response = await POST(
      makeRequest(null, { userIds: ["2"] }, "Bearer whatever"),
    )

    expect(response.status).toBe(400)
    expect(mocks.heartbeatMany).not.toHaveBeenCalled()
  })

  test("rejects with 400 when the workspaceId query param is not all-digits (LOW: zodBigintAsString shape check)", async () => {
    const response = await POST(
      makeRequest("not-a-bigint", { userIds: ["2"] }, "Bearer whatever"),
    )

    expect(response.status).toBe(400)
    expect(mocks.heartbeatMany).not.toHaveBeenCalled()
  })

  test("verifies the signature BEFORE parsing the JSON body — a malformed body never blocks the 401", async () => {
    const response = await POST(
      new Request(
        "http://localhost/api/workspace-presence/report?workspaceId=1",
        {
          method: "POST",
          headers: { Authorization: "Bearer garbage-token" },
          body: "{not json",
        },
      ) as unknown as Parameters<typeof POST>[0],
    )

    expect(response.status).toBe(401)
    expect(mocks.heartbeatMany).not.toHaveBeenCalled()
  })

  test("rejects with 401 when the token was minted for a different workspace (cross-workspace replay, MEDIUM-3)", async () => {
    const token = await signPresenceToken({
      workspaceId: "other-workspace",
      userIds: ["2"],
    })

    const response = await POST(
      makeRequest("1", { userIds: ["2"] }, `Bearer ${token}`),
    )

    expect(response.status).toBe(401)
    expect(mocks.heartbeatMany).not.toHaveBeenCalled()
  })

  test("rejects with 401 when the token's purpose is not presence-report (a broadcast token must not work here, MEDIUM-3)", async () => {
    const token = await signPresenceToken({
      workspaceId: "1",
      userIds: ["2"],
      purpose: REALTIME_TOKEN_PURPOSE.broadcast,
    })

    const response = await POST(
      makeRequest("1", { userIds: ["2"] }, `Bearer ${token}`),
    )

    expect(response.status).toBe(401)
    expect(mocks.heartbeatMany).not.toHaveBeenCalled()
  })

  test("rejects with 401 when the token carries no purpose claim at all", async () => {
    const token = await signPresenceTokenWithNoPurposeClaim({
      workspaceId: "1",
      userIds: ["2"],
    })

    const response = await POST(
      makeRequest("1", { userIds: ["2"] }, `Bearer ${token}`),
    )

    expect(response.status).toBe(401)
    expect(mocks.heartbeatMany).not.toHaveBeenCalled()
  })

  test("rejects with 401 when signed with a different secret", async () => {
    const token = await signPresenceToken({
      workspaceId: "1",
      userIds: ["2"],
      purpose: REALTIME_TOKEN_PURPOSE.presenceReport,
      secret: "b".repeat(32),
    })

    const response = await POST(
      makeRequest("1", { userIds: ["2"] }, `Bearer ${token}`),
    )

    expect(response.status).toBe(401)
    expect(mocks.heartbeatMany).not.toHaveBeenCalled()
  })

  test("rejects with 401 when the body's userIds do not match the token's bodyHash (tampered body, MEDIUM-3)", async () => {
    const token = await signPresenceToken({
      workspaceId: "1",
      userIds: ["2", "3"],
    })

    const response = await POST(
      makeRequest("1", { userIds: ["2", "4"] }, `Bearer ${token}`),
    )

    expect(response.status).toBe(401)
    expect(mocks.heartbeatMany).not.toHaveBeenCalled()
  })

  test("rejects with 400 on an invalid body shape", async () => {
    const token = await signPresenceToken({ workspaceId: "1", userIds: [] })

    const response = await POST(
      makeRequest("1", { userIds: "not-an-array" }, `Bearer ${token}`),
    )

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
      "@chatbotx.io/partysocket-config/presence"
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
