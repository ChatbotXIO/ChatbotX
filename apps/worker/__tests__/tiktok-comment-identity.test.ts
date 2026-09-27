import { beforeEach, describe, expect, test, vi } from "vitest"

const mockListTiktokComments = vi.fn()

vi.mock("@chatbotx.io/integration-tiktok/apis/comment", () => ({
  listTiktokComments: mockListTiktokComments,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const { resolveTiktokCommenterIdentity } = await import(
  "../src/integration/handlers/tiktok-comment-identity"
)

const AUTH = {
  tokens: { accessToken: "tiktok-token" },
  metadata: { openId: "open-id-1" },
} as never

const lookup = () =>
  resolveTiktokCommenterIdentity({
    auth: AUTH,
    commentId: "7689768556360614677",
    videoId: "7687198531685207314",
  })

describe("resolveTiktokCommenterIdentity image_url", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns the comment's image_url", async () => {
    mockListTiktokComments.mockResolvedValue({
      comments: [
        {
          comment_id: "7689768556360614677",
          video_id: "7687198531685207314",
          username: "commenter",
          image_url: "https://p16.tiktokcdn.test/comment-image.jpeg",
        },
      ],
    })

    await expect(lookup()).resolves.toEqual(
      expect.objectContaining({
        imageUrl: "https://p16.tiktokcdn.test/comment-image.jpeg",
        isOwner: false,
      }),
    )
  })

  test("leaves imageUrl undefined for a text comment", async () => {
    mockListTiktokComments.mockResolvedValue({
      comments: [
        {
          comment_id: "7689768556360614677",
          video_id: "7687198531685207314",
          image_url: "",
        },
      ],
    })

    const identity = await lookup()

    expect(identity?.imageUrl).toBeUndefined()
  })
})
