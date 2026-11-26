import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  buildDestinationAvatarUrls: vi.fn(),
}))

vi.mock("@chatbotx.io/encryption", () => ({
  signMediaToken: async () => "signed-token",
}))
vi.mock("../src/logger", () => ({ logger: { warn: vi.fn() } }))
vi.mock("../src/publish-destination/avatar-url", () => ({
  buildDestinationAvatarUrls: mocks.buildDestinationAvatarUrls,
}))
vi.mock("../src/publish-destination/service", () => ({
  // The real rule needs the destination's state; the test stands in with "no stored picture".
  needsAvatarProxy: (row: { avatar: string | null }) => !row.avatar,
}))
vi.mock("../src/platform/settings", () => ({
  resolveWorkspaceAppUrl: async () => "https://app.test",
}))

const STORAGE_URL_PREFIX = /^https:\/\/storage\.test\//

const { resolveCommenterAvatars, resolveInboxAvatars } = await import(
  "../src/channel-post/comment-avatars"
)

const commenter = (id: string, avatar: string | null) => ({
  avatar,
  id,
  name: id,
  phoneNumber: null,
  tags: [],
})

const messengerInboxes = new Map([
  ["real", [{ channel: "messenger", id: "ci-real" }]],
  ["sentinel", [{ channel: "messenger", id: "ci-sentinel" }]],
  ["none", [{ channel: "messenger", id: "ci-none" }]],
])

beforeEach(() => {
  vi.clearAllMocks()
  mocks.buildDestinationAvatarUrls.mockImplementation(
    async ({ publishDestinationIds }: { publishDestinationIds: string[] }) =>
      new Map(
        publishDestinationIds.map((id) => [id, `https://app.test/p/${id}`]),
      ),
  )
})

describe("resolveCommenterAvatars", () => {
  test("a stored key becomes its absolute storage URL, never the raw key", async () => {
    const result = await resolveCommenterAvatars({
      commenters: [commenter("real", "workspaces/1/avatar.png")],
      contactInboxesByContactId: messengerInboxes,
      storageUrl: "https://storage.test",
      workspaceId: "ws-1",
    })

    const url = result.get("real")
    expect(url).toMatch(STORAGE_URL_PREFIX)
    expect(url).toContain("workspaces/1/avatar.png")
  })

  test("a no-avatar marker resolves to the placeholder, not a storage URL", async () => {
    const result = await resolveCommenterAvatars({
      commenters: [
        commenter("sentinel", `public/img/no_avatar.jpg?time=${Date.now()}`),
      ],
      contactInboxesByContactId: messengerInboxes,
      storageUrl: "https://storage.test",
      workspaceId: "ws-1",
    })

    expect(result.get("sentinel")).toBe(
      "https://app.test/media/default-avatar.svg",
    )
  })

  test("a contact with no picture on a channel that can fetch one gets a proxy URL; one with no inbox gets none", async () => {
    const result = await resolveCommenterAvatars({
      commenters: [commenter("none", null), commenter("orphan", null)],
      contactInboxesByContactId: messengerInboxes,
      storageUrl: "https://storage.test",
      workspaceId: "ws-1",
    })

    expect(result.get("none")).toContain("/media/avatar/")
    expect(result.get("orphan")).toBeNull()
  })

  test("a page with no commenters resolves nothing", async () => {
    const result = await resolveCommenterAvatars({
      commenters: [],
      contactInboxesByContactId: new Map(),
      storageUrl: "https://storage.test",
      workspaceId: "ws-1",
    })

    expect(result.size).toBe(0)
  })
})

const destination = (
  id: string,
  inboxId: string | null,
  avatar: string | null,
) => ({ avatar, id, inboxId }) as never

describe("resolveInboxAvatars", () => {
  test("a stored picture is its storage URL; none stored yet is the signed on-view link; no binding is absent", async () => {
    const result = await resolveInboxAvatars({
      destinations: [
        destination("d1", "inbox-1", "workspaces/1/page.png"),
        destination("d2", "inbox-2", null),
      ],
      storageUrl: "https://storage.test",
      workspaceId: "ws-1",
    })

    expect(result.get("inbox-1")).toContain("workspaces/1/page.png")
    expect(result.get("inbox-1")).toMatch(STORAGE_URL_PREFIX)
    expect(result.get("inbox-2")).toBe("https://app.test/p/d2")
    expect(result.has("inbox-3")).toBe(false)
    expect(mocks.buildDestinationAvatarUrls).toHaveBeenCalledWith({
      publishDestinationIds: ["d2"],
      workspaceId: "ws-1",
    })
  })

  test("a destination with no inbox (TikTok) is skipped, and no destinations build no links", async () => {
    const result = await resolveInboxAvatars({
      destinations: [destination("d9", null, "https://tiktok.test/a.jpg")],
      storageUrl: "https://storage.test",
      workspaceId: "ws-1",
    })

    expect(result.size).toBe(0)
  })
})
