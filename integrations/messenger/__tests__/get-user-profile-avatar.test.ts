import { beforeEach, describe, expect, test, vi } from "vitest"

const mockGet = vi.hoisted(() => vi.fn())
const mockPutObject = vi.hoisted(() => vi.fn())
const mockFetchMedia = vi.hoisted(() => vi.fn())
const mockStoreIncomingImage = vi.hoisted(() => vi.fn())

vi.mock("../src/exception", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/exception")>()
  return { ...actual, rescue: (_: string, fn: () => Promise<unknown>) => fn() }
})

vi.mock("../src/lib/http-client", () => ({
  facebookGraphClient: { get: mockGet },
}))

vi.mock("@chatbotx.io/utils/media-download", () => ({
  fetchMediaWithLimits: mockFetchMedia,
}))

vi.mock("@chatbotx.io/utils/store-incoming-image", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@chatbotx.io/utils/store-incoming-image")
    >()
  return { ...actual, storeIncomingImage: mockStoreIncomingImage }
})

const { contactHandlers } = await import("../src/handlers/contact")

const MIRRORED_AVATAR_PATH = /^public\/space\/workspace-1\/avatars\//

const props = (data: { includeAvatar?: boolean } = {}) =>
  ({
    data: { sourceId: "user-123", ...data },
    ctx: {
      auth: {
        tokens: { accessToken: "test-access-token" },
        metadata: { version: "v23.0" },
      },
      uploader: { putObject: mockPutObject },
      storagePrefix: "workspace-1",
    },
  }) as never

describe("Messenger getProfile avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({
      id: "user-123",
      first_name: "Ada",
      last_name: "Lovelace",
      profile_pic: "https://scontent.xx.fbcdn.net/avatar.jpg",
    })
    mockStoreIncomingImage.mockImplementation(
      async ({ key, mimeType }: { key: string; mimeType: string }) => ({
        originPath: key,
        mimeType,
        size: 3,
        optimized: false,
      }),
    )
    mockFetchMedia.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
    })
  })

  test("downloads and stores the picture by default", async () => {
    const result = await contactHandlers.getProfile?.(props())

    expect(mockFetchMedia).toHaveBeenCalledTimes(1)
    expect(result?.avatar).toMatch(MIRRORED_AVATAR_PATH)
  })

  test("stores the picture through the inline encoder with the avatar profile", async () => {
    await contactHandlers.getProfile?.(props())

    expect(mockStoreIncomingImage).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: "avatar",
        mimeType: "image/jpeg",
        acl: "public-read",
        uploader: { putObject: mockPutObject },
        key: expect.stringMatching(MIRRORED_AVATAR_PATH),
      }),
    )
  })

  test("skips the picture entirely when the caller does not want it, keeping the rest of the profile", async () => {
    const result = await contactHandlers.getProfile?.(
      props({ includeAvatar: false }),
    )

    expect(mockFetchMedia).not.toHaveBeenCalled()
    expect(mockPutObject).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      sourceId: "user-123",
      firstName: "Ada",
      lastName: "Lovelace",
    })
    expect(result?.avatar).toBeUndefined()
  })
})
