import { beforeEach, describe, expect, test, vi } from "vitest"

const mockGet = vi.hoisted(() => vi.fn())
const mockPutObject = vi.hoisted(() => vi.fn())

vi.mock("../src/exception", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/exception")>()
  return { ...actual, rescue: (_: string, fn: () => Promise<unknown>) => fn() }
})

vi.mock("../src/lib/http-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/http-client")>()
  return {
    ...actual,
    instagramBusinessClient: { get: mockGet },
  }
})

const { contactHandlers } = await import("../src/handlers/contact")

const createProps = (sourceId = "igsid-1") =>
  ({
    ctx: {
      auth: {
        tokens: { accessToken: "instagram-token" },
        metadata: { version: "v23.0" },
      },
      uploader: { putObject: mockPutObject },
    },
    data: { sourceId },
  }) as never

describe("Instagram getContactProfilePicUrl", () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPutObject.mockReset()
  })

  test("returns the raw Graph profile picture URL", async () => {
    mockGet.mockResolvedValue({
      id: "igsid-1",
      profile_pic: "https://cdn.example/avatar.jpg",
    })

    await expect(
      contactHandlers.getContactProfilePicUrl?.(createProps()),
    ).resolves.toBe("https://cdn.example/avatar.jpg")

    expect(mockGet).toHaveBeenCalledWith(
      "v23.0/igsid-1?fields=id%2Cname%2Cusername%2Cprofile_pic&access_token=instagram-token",
    )
    expect(mockPutObject).not.toHaveBeenCalled()
  })

  test("returns null when Graph has no profile picture", async () => {
    mockGet.mockResolvedValue({ id: "igsid-1" })

    await expect(
      contactHandlers.getContactProfilePicUrl?.(createProps()),
    ).resolves.toBeNull()
  })
})
