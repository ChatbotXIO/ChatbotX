// @vitest-environment node
import { NextResponse } from "next/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  resolveForView: vi.fn(),
  resolveMediaRequest: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  publishDestinationAvatarService: { resolveForView: mocks.resolveForView },
  resolveTenantSettings: async () => ({ storageUrl: "https://cdn.example/b/" }),
}))
vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, base: string) => `${base}${path}`,
}))
vi.mock("@chatbotx.io/channel-registry/publish-avatar-ops", () => ({
  createPublishAvatarOps: () => ({ fetchPictureUrl: vi.fn() }),
}))
vi.mock("@chatbotx.io/logger", () => ({ toLogSafeError: (e: unknown) => e }))
vi.mock("@/lib/log", () => ({ httpLogger: { error: vi.fn() } }))
vi.mock("../src/app/media/media-proxy", () => ({
  placeholderUrl: (_req: unknown, name: string) =>
    new URL(`https://app.example/media/${name}`),
  resolveMediaRequest: mocks.resolveMediaRequest,
}))

const { GET } = await import(
  "../src/app/media/destination-avatar/[token]/route"
)

const call = () =>
  GET(new Request("http://localhost/media/destination-avatar/t") as never, {
    params: Promise.resolve({ token: "t" }),
  })

describe("destination avatar route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveMediaRequest.mockResolvedValue({
      kind: "destinationAvatar",
      refId: "d1",
      workspaceId: "w1",
    })
  })

  test("redirects to the stored copy", async () => {
    mocks.resolveForView.mockResolvedValue({ kind: "stored", path: "p/a" })
    const res = await call()
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("https://cdn.example/b/p/a")
    expect(mocks.resolveForView.mock.calls[0]?.[0]).toEqual({
      publishDestinationId: "d1",
      workspaceId: "w1",
    })
  })

  test("redirects to the freshly resolved picture", async () => {
    mocks.resolveForView.mockResolvedValue({
      kind: "fresh",
      url: "https://scontent.xx.fbcdn.net/a.jpg",
    })
    const res = await call()
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe(
      "https://scontent.xx.fbcdn.net/a.jpg",
    )
  })

  test("serves the placeholder when there is no picture", async () => {
    mocks.resolveForView.mockResolvedValue({ kind: "placeholder" })
    const res = await call()
    expect(res.headers.get("location")).toBe(
      "https://app.example/media/default-avatar.svg",
    )
  })

  test("404s a destination outside the token's workspace", async () => {
    mocks.resolveForView.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
  })

  test("passes through a rejected token or rate limit", async () => {
    mocks.resolveMediaRequest.mockResolvedValue(
      new NextResponse(null, { status: 404 }),
    )
    expect((await call()).status).toBe(404)
    expect(mocks.resolveForView).not.toHaveBeenCalled()
  })

  test("degrades to the placeholder on an unexpected error", async () => {
    mocks.resolveForView.mockRejectedValue(new Error("boom"))
    const res = await call()
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toContain("default-avatar.svg")
  })
})
