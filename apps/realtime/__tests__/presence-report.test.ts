import { jwtVerify } from "jose"
import { beforeEach, describe, expect, it, vi } from "vitest"

const SECRET = "s".repeat(32)

const { kyPostMock, loggerErrorMock } = vi.hoisted(() => ({
  kyPostMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}))

vi.mock("../src/env", () => ({
  env: {
    REALTIME_BROADCAST_SECRET: SECRET,
    NEXT_PUBLIC_BUILDER_URL: "https://builder.example.com",
  },
}))

vi.mock("../src/logger", () => ({
  logger: { error: loggerErrorMock, warn: vi.fn(), info: vi.fn() },
}))

vi.mock("ky", () => ({
  default: { post: kyPostMock },
}))

const { reportWorkspacePresence } = await import("../src/lib/presence-report")
const { hashPresenceUserIds, MAX_PRESENCE_USER_IDS_PER_REPORT } = await import(
  "@chatbotx.io/partysocket-config/presence"
)

const encodeSecret = () => new TextEncoder().encode(SECRET)

beforeEach(() => {
  vi.clearAllMocks()
  kyPostMock.mockResolvedValue(undefined)
})

describe("reportWorkspacePresence", () => {
  it("POSTs to the builder's presence-report route with the workspaceId as a query param and a workspace-audience, presence-report-purpose bearer token", async () => {
    await reportWorkspacePresence("ws_1", ["u_1", "u_2"])

    expect(kyPostMock).toHaveBeenCalledTimes(1)
    const [url, options] = kyPostMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(url).toBe(
      "https://builder.example.com/api/workspace-presence/report?workspaceId=ws_1",
    )
    expect(options.json).toEqual({ userIds: ["u_1", "u_2"] })
    expect(options.retry).toBe(0)

    const headers = options.headers as Record<string, string>
    const token = headers.Authorization.replace("Bearer ", "")
    const { payload } = await jwtVerify(token, encodeSecret(), {
      audience: "workspace:ws_1",
    })
    expect(payload.purpose).toBe("presence-report")
    expect(payload.bodyHash).toBe(await hashPresenceUserIds(["u_1", "u_2"]))
  })

  it("truncates an over-cap userIds batch before hashing and sending (LOW-7)", async () => {
    const userIds = Array.from(
      { length: MAX_PRESENCE_USER_IDS_PER_REPORT + 5 },
      (_, i) => `u_${i}`,
    )

    await reportWorkspacePresence("ws_1", userIds)

    const [, options] = kyPostMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    const sentUserIds = (options.json as { userIds: string[] }).userIds
    expect(sentUserIds).toHaveLength(MAX_PRESENCE_USER_IDS_PER_REPORT)
  })

  it("logs and swallows a failed report — never throws (no retry, the next report supersedes it)", async () => {
    kyPostMock.mockRejectedValue(new Error("network error"))

    await expect(
      reportWorkspacePresence("ws_1", ["u_1"]),
    ).resolves.toBeUndefined()

    expect(loggerErrorMock).toHaveBeenCalledTimes(1)
    expect(loggerErrorMock.mock.calls[0]?.[0]).toMatchObject({
      err: expect.any(Error),
      workspaceId: "ws_1",
    })
  })
})
