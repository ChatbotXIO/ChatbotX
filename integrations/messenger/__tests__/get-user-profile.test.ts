import { beforeEach, describe, expect, test, vi } from "vitest"

const mockGet = vi.hoisted(() => vi.fn())
const mockPutObject = vi.hoisted(() => vi.fn())
const mockFetchMediaWithLimits = vi.hoisted(() => vi.fn())

vi.mock("../src/exception", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/exception")>()
  return { ...actual, rescue: (_: string, fn: () => Promise<unknown>) => fn() }
})

vi.mock("../src/lib/http-client", () => ({
  facebookGraphClient: { get: mockGet },
}))

vi.mock("@chatbotx.io/utils/media-download", () => ({
  fetchMediaWithLimits: mockFetchMediaWithLimits,
}))

const { contactHandlers } = await import("../src/handlers/contact")
const { getUserProfile } = await import("../src/apis/user")

const createProps = (sourceId = "user-123", avatar?: boolean) =>
  ({
    data: avatar === undefined ? { sourceId } : { sourceId, avatar },
    ctx: {
      auth: {
        tokens: { accessToken: "test-access-token" },
        metadata: {
          version: "v23.0",
        },
      },
      uploader: { putObject: mockPutObject },
    },
  }) as never

describe("getUserProfile", () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPutObject.mockReset()
    mockFetchMediaWithLimits.mockReset()
  })

  test("requests all supported profile fields", async () => {
    mockGet.mockResolvedValueOnce({ id: "user-123" })

    await getUserProfile(createProps())

    expect(mockGet).toHaveBeenCalledWith("v23.0/user-123", {
      headers: {
        Authorization: "Bearer test-access-token",
      },
      searchParams: {
        fields: "first_name,last_name,profile_pic,locale,timezone,gender",
      },
    })
  })

  test("omits profile_pic and never mirrors the avatar when avatar is false", async () => {
    mockGet.mockResolvedValueOnce({
      id: "user-123",
      first_name: "Ada",
      profile_pic: "https://cdn.example/avatar.jpg",
    })

    await getUserProfile(createProps("user-123", false))

    expect(mockGet).toHaveBeenCalledWith("v23.0/user-123", {
      headers: {
        Authorization: "Bearer test-access-token",
      },
      searchParams: {
        fields: "first_name,last_name,locale,timezone,gender",
      },
    })
    expect(mockFetchMediaWithLimits).not.toHaveBeenCalled()
    expect(mockPutObject).not.toHaveBeenCalled()
  })

  test("mirrors the profile picture by default", async () => {
    mockGet.mockResolvedValueOnce({
      id: "user-123",
      profile_pic: "https://cdn.example/avatar.jpg",
    })
    mockFetchMediaWithLimits.mockResolvedValueOnce({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
    })

    await expect(getUserProfile(createProps())).resolves.toMatchObject({
      avatar: expect.stringContaining("/avatars/"),
    })

    expect(mockFetchMediaWithLimits).toHaveBeenCalledWith(
      "https://cdn.example/avatar.jpg",
      expect.anything(),
    )
    expect(mockPutObject).toHaveBeenCalledTimes(1)
  })

  test.each([
    [7, "+07:00"],
    [-3.5, "-03:30"],
    [0, "+00:00"],
    [undefined, undefined],
  ])("normalizes timezone %s", async (timezone, expected) => {
    mockGet.mockResolvedValueOnce({
      id: "user-123",
      first_name: "Ada",
      last_name: "Lovelace",
      locale: "en_US",
      timezone,
      gender: "MALE",
    })

    await expect(getUserProfile(createProps())).resolves.toMatchObject({
      sourceId: "user-123",
      firstName: "Ada",
      lastName: "Lovelace",
      locale: "en_US",
      timezone: expected,
      gender: "male",
    })
  })

  test("drops unsupported gender values", async () => {
    mockGet.mockResolvedValueOnce({
      id: "user-123",
      gender: "custom",
    })

    await expect(getUserProfile(createProps())).resolves.toMatchObject({
      sourceId: "user-123",
      gender: undefined,
    })
  })
})

describe("getContactProfilePicUrl", () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPutObject.mockReset()
    mockFetchMediaWithLimits.mockReset()
  })

  test("returns the raw Graph profile picture URL without mirroring it", async () => {
    mockGet.mockResolvedValueOnce({
      id: "user-123",
      profile_pic: "https://cdn.example/avatar.jpg",
    })

    await expect(
      contactHandlers.getContactProfilePicUrl?.(createProps()),
    ).resolves.toBe("https://cdn.example/avatar.jpg")

    expect(mockGet).toHaveBeenCalledWith("v23.0/user-123", {
      headers: {
        Authorization: "Bearer test-access-token",
      },
      searchParams: {
        fields: "first_name,last_name,profile_pic,locale,timezone,gender",
      },
    })
    expect(mockPutObject).not.toHaveBeenCalled()
  })

  test("returns null when Graph has no profile picture", async () => {
    mockGet.mockResolvedValueOnce({ id: "user-123" })

    await expect(
      contactHandlers.getContactProfilePicUrl?.(createProps()),
    ).resolves.toBeNull()
  })
})
