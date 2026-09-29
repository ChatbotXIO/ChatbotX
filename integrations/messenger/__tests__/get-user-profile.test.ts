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

const { HTTPError } = await import("ky")
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
      storagePrefix: "workspace-1",
    },
  }) as never

const MIRRORED_AVATAR_PATH = /^public\/space\/workspace-1\/avatars\//

const PUBLIC_USER_FIELDS =
  "first_name,last_name,name,picture.height(480).width(480){url,is_silhouette}"
const PUBLIC_PAGE_FIELDS =
  "name,picture.height(480).width(480){url,is_silhouette}"

const graphError = (code: number, message: string) =>
  Object.assign(
    new HTTPError(
      new Response(null, { status: 400 }),
      new Request("https://graph.facebook.com/v23.0/user-123"),
      {} as never,
    ),
    { data: { error: { code, message } } },
  )

const noProfileError = () =>
  graphError(100, "(#100) No profile available for this user.")

const calledFields = () =>
  mockGet.mock.calls.map(
    ([, options]) =>
      (options as { searchParams: { fields: string } }).searchParams.fields,
  )

describe("getUserProfile", () => {
  beforeEach(() => {
    mockGet.mockReset()
    // Public-profile fallback: no picture unless a test says otherwise.
    mockGet.mockResolvedValue({ id: "user-123" })
    mockPutObject.mockReset()
    mockFetchMediaWithLimits.mockReset()
    mockFetchMediaWithLimits.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
    })
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

  test("omits pictures from the public-profile fallback when avatar is false", async () => {
    mockGet.mockRejectedValueOnce(noProfileError()).mockResolvedValueOnce({
      id: "user-123",
      first_name: "Ada",
      last_name: "Lovelace",
      name: "Ada Lovelace",
      picture: {
        data: { url: "https://cdn.example/public.jpg", is_silhouette: false },
      },
    })

    const result = await getUserProfile(createProps("user-123", false))

    expect(calledFields()).toEqual([
      "first_name,last_name,locale,timezone,gender",
      "first_name,last_name,name",
    ])
    expect(result).toMatchObject({
      sourceId: "user-123",
      firstName: "Ada",
      lastName: "Lovelace",
    })
    expect(result?.avatar).toBeUndefined()
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

describe("getUserProfile public-profile fallback", () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPutObject.mockReset()
    mockFetchMediaWithLimits.mockReset()
    mockFetchMediaWithLimits.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
    })
  })

  test("keeps the Messenger profile and skips the fallback when profile_pic exists", async () => {
    mockGet.mockResolvedValueOnce({
      id: "user-123",
      first_name: "Ada",
      profile_pic: "https://cdn.example/avatar.jpg",
    })

    const result = await getUserProfile(createProps())

    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(result?.avatar).toMatch(MIRRORED_AVATAR_PATH)
  })

  test("uses the public picture for a commenter who never messaged the page", async () => {
    mockGet.mockRejectedValueOnce(noProfileError()).mockResolvedValueOnce({
      id: "user-123",
      first_name: "Ada",
      last_name: "Lovelace",
      name: "Ada Lovelace",
      picture: {
        data: { url: "https://cdn.example/public.jpg", is_silhouette: false },
      },
    })

    const result = await getUserProfile(createProps())

    expect(calledFields()).toEqual([
      "first_name,last_name,profile_pic,locale,timezone,gender",
      PUBLIC_USER_FIELDS,
    ])
    expect(result).toMatchObject({
      sourceId: "user-123",
      firstName: "Ada",
      lastName: "Lovelace",
    })
    expect(result?.avatar).toMatch(MIRRORED_AVATAR_PATH)
    expect(mockPutObject).toHaveBeenCalledTimes(1)
  })

  test("does not store Facebook's default silhouette", async () => {
    mockGet.mockRejectedValueOnce(noProfileError()).mockResolvedValueOnce({
      id: "user-123",
      first_name: "Ada",
      picture: {
        data: {
          url: "https://cdn.example/silhouette.jpg",
          is_silhouette: true,
        },
      },
    })

    const result = await getUserProfile(createProps())

    expect(result?.avatar).toBeUndefined()
    expect(mockPutObject).not.toHaveBeenCalled()
  })

  test("retries with Page fields when the commenter is a Page", async () => {
    mockGet
      .mockRejectedValueOnce(noProfileError())
      .mockRejectedValueOnce(
        graphError(
          100,
          "(#100) Tried accessing nonexisting field (first_name) on node type (Page)",
        ),
      )
      .mockResolvedValueOnce({
        id: "user-123",
        name: "Some Page",
        picture: {
          data: { url: "https://cdn.example/page.jpg", is_silhouette: false },
        },
      })

    const result = await getUserProfile(createProps())

    expect(calledFields()).toEqual([
      "first_name,last_name,profile_pic,locale,timezone,gender",
      PUBLIC_USER_FIELDS,
      PUBLIC_PAGE_FIELDS,
    ])
    expect(result).toMatchObject({ firstName: "Some Page" })
    expect(result?.avatar).toBeDefined()
  })

  test("rethrows the Messenger error when both lookups fail", async () => {
    const messengerError = noProfileError()
    mockGet
      .mockRejectedValueOnce(messengerError)
      .mockRejectedValueOnce(graphError(190, "Invalid token"))

    await expect(getUserProfile(createProps())).rejects.toBe(messengerError)
  })
})

describe("getContactProfilePicUrl", () => {
  beforeEach(() => {
    mockGet.mockReset()
    // Public-profile fallback: no picture unless a test says otherwise.
    mockGet.mockResolvedValue({ id: "user-123" })
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

  test("falls back to the public picture when profile_pic is unavailable", async () => {
    mockGet.mockRejectedValueOnce(noProfileError()).mockResolvedValueOnce({
      id: "user-123",
      picture: {
        data: { url: "https://cdn.example/public.jpg", is_silhouette: false },
      },
    })

    await expect(
      contactHandlers.getContactProfilePicUrl?.(createProps()),
    ).resolves.toBe("https://cdn.example/public.jpg")
    expect(mockPutObject).not.toHaveBeenCalled()
  })

  test("returns null when Graph has no profile picture", async () => {
    mockGet.mockResolvedValueOnce({ id: "user-123" })

    await expect(
      contactHandlers.getContactProfilePicUrl?.(createProps()),
    ).resolves.toBeNull()
  })
})
