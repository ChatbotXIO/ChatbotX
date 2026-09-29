import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"

vi.mock("../src/lib/http-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/http-client")>()),
  facebookGraphClient: {
    get: vi.fn(),
  },
}))

// Dynamic imports ensure vi.mock is fully applied before loading these modules.
const { listReelsPosts } = await import("../src/apis/post")
const { facebookGraphClient } = await import("../src/lib/http-client")

const mockGet = facebookGraphClient.get as MockInstance

const auth = { tokens: { accessToken: "page-token" } } as never

describe("listReelsPosts", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  // The `feed` webhook reports a reel comment by the post id, which never
  // equals the reel's video id — storing the video id would leave a
  // reel-scoped automation matching nothing.
  test("returns the reel's post id rather than its video id", async () => {
    mockGet.mockResolvedValue({
      data: [
        {
          id: "video-id",
          post_id: "page-id_story-id",
          description: "My reel",
          created_time: "2026-09-29T08:00:00+0000",
        },
      ],
    })

    const [reel] = await listReelsPosts({ auth, pageId: "page-id" })

    expect(reel.id).toBe("page-id_story-id")
    expect(reel.message).toBe("My reel")
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining("/page-id/video_reels"),
      expect.objectContaining({
        searchParams: expect.objectContaining({
          fields: expect.stringContaining("post_id"),
        }),
      }),
    )
  })

  test("falls back to the video id when Facebook returns no post id", async () => {
    mockGet.mockResolvedValue({
      data: [{ id: "video-id", created_time: "2026-09-29T08:00:00+0000" }],
    })

    const [reel] = await listReelsPosts({ auth, pageId: "page-id" })

    expect(reel.id).toBe("video-id")
  })
})
