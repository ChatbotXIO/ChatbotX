// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getPresignedUpload: vi.fn(),
  createPending: vi.fn(),
  resolveTenantSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { getPresignedUpload: mocks.getPresignedUpload },
}))
vi.mock("@chatbotx.io/business", () => ({
  fileService: { createPending: mocks.createPending },
  resolveTenantSettings: mocks.resolveTenantSettings,
}))
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createId: () => "gen-id",
}))

const { createAdsCreativeImageUpload } = await import(
  "@/features/ads-campaign/lib/create-creative-image-upload"
)

const base = {
  workspaceId: "ws-1",
  userId: null,
  fileName: "banner.png",
  mimeType: "image/png",
  fileSize: 1024,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getPresignedUpload.mockResolvedValue("https://signed.example/put")
  mocks.createPending.mockResolvedValue({ id: "file-1" })
  mocks.resolveTenantSettings.mockResolvedValue({
    storageUrl: "https://cdn.example.com",
  })
})

describe("createAdsCreativeImageUpload", () => {
  test("mints a File row inside this workspace's ads-creative prefix", async () => {
    const result = await createAdsCreativeImageUpload(base)

    expect(result.imageKey).toBe(
      "public/space/ws-1/ads-campaign/creatives/gen-id.png",
    )
    expect(result.fileId).toBe("file-1")
    expect(mocks.createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contextType: "generic",
        subType: "adsCampaignCreative",
        path: result.imageKey,
        mimeType: "image/png",
      }),
    )
  })

  test("the key never contains the caller's file name", async () => {
    const result = await createAdsCreativeImageUpload({
      ...base,
      fileName: "../../etc/passwd.png",
    })

    expect(result.imageKey).not.toContain("passwd")
    expect(
      result.imageKey.startsWith("public/space/ws-1/ads-campaign/creatives/"),
    ).toBe(true)
  })

  test("rejects a non-image type and an oversized file before signing", async () => {
    await expect(
      createAdsCreativeImageUpload({
        ...base,
        mimeType: "application/pdf",
        fileName: "a.pdf",
      }),
    ).rejects.toMatchObject({ code: "adsCreativeUnsupportedImage" })
    await expect(
      createAdsCreativeImageUpload({ ...base, fileSize: 11 * 1024 * 1024 }),
    ).rejects.toMatchObject({ code: "adsCreativeImageTooLarge" })

    expect(mocks.getPresignedUpload).not.toHaveBeenCalled()
    expect(mocks.createPending).not.toHaveBeenCalled()
  })

  test("a MIME type that does not match the extension is rejected", async () => {
    await expect(
      createAdsCreativeImageUpload({ ...base, fileName: "a.gif" }),
    ).rejects.toMatchObject({ code: "adsCreativeUnsupportedImage" })
  })
})
