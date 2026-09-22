import { beforeEach, describe, expect, test, vi } from "vitest"

const mockGet = vi.hoisted(() => vi.fn())
const mockPutObject = vi.hoisted(() => vi.fn())

vi.mock("../src/exception", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/exception")>()
  return { ...actual, rescue: (_: string, fn: () => Promise<unknown>) => fn() }
})

vi.mock("../src/lib/http-client", () => ({
  facebookGraphClient: { get: mockGet },
}))

const { contactHandlers } = await import("../src/handlers/contact")
const { getUserProfile } = await import("../src/apis/user")

const createProps = (sourceId = "user-123") =>
  ({
    data: { sourceId },
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
