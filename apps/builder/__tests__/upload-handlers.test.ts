// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/partials", () => ({
  uploadTypes: {
    enum: {
      import: "import",
      generic: "generic",
      adsCampaignCreative: "adsCampaignCreative",
    },
  },
}))

vi.mock("@chatbotx.io/imports", () => ({
  getImportEntry: vi.fn(),
}))

const { getUploadHandler } = await import("../src/lib/upload/handlers")

describe("adsCampaignCreative upload handler", () => {
  const handler = getUploadHandler("adsCampaignCreative" as never)

  test("accepts a path inside this workspace's ads-creative prefix", () => {
    const result = handler({
      workspaceId: "1",
      fileName: "photo.png",
      mimeType: "image/png",
      subType: "adsCampaignCreative",
      path: "public/space/1/ads-campaign/creatives/abc123",
    })

    expect(result).toEqual({
      ok: true,
      path: "public/space/1/ads-campaign/creatives/abc123",
    })
  })

  test("rejects a path outside the ads-creative prefix (e.g. the general public/space namespace)", () => {
    const result = handler({
      workspaceId: "1",
      fileName: "photo.png",
      mimeType: "image/png",
      subType: "adsCampaignCreative",
      path: "public/space/1/products/images/abc123",
    })

    expect(result.ok).toBe(false)
  })

  test("rejects a cross-workspace path", () => {
    const result = handler({
      workspaceId: "1",
      fileName: "photo.png",
      mimeType: "image/png",
      subType: "adsCampaignCreative",
      path: "public/space/2/ads-campaign/creatives/abc123",
    })

    expect(result.ok).toBe(false)
  })

  test("rejects when workspaceId is missing", () => {
    const result = handler({
      fileName: "photo.png",
      mimeType: "image/png",
      subType: "adsCampaignCreative",
      path: "public/space/1/ads-campaign/creatives/abc123",
    })

    expect(result.ok).toBe(false)
  })

  test("rejects when path is missing", () => {
    const result = handler({
      workspaceId: "1",
      fileName: "photo.png",
      mimeType: "image/png",
      subType: "adsCampaignCreative",
    })

    expect(result.ok).toBe(false)
  })
})

describe("generic upload handler — privileged-prefix guard", () => {
  const handler = getUploadHandler("generic" as never)

  test("accepts an ordinary public/space path", () => {
    const result = handler({
      workspaceId: "1",
      fileName: "photo.png",
      mimeType: "image/png",
      subType: "generic",
      path: "public/space/1/products/images/abc123",
    })

    expect(result).toEqual({
      ok: true,
      path: "public/space/1/products/images/abc123",
    })
  })

  test("REJECTS a path inside the super-admin-gated ads-creative prefix (authz-bypass guard)", () => {
    // A member could otherwise use type:"generic" to write into the
    // ads-creative namespace and skip the route's super-admin gate.
    const result = handler({
      workspaceId: "1",
      fileName: "photo.png",
      mimeType: "image/png",
      subType: "generic",
      path: "public/space/1/ads-campaign/creatives/abc123",
    })

    expect(result.ok).toBe(false)
  })

  test("REJECTS the privileged prefix regardless of letter case", () => {
    const result = handler({
      workspaceId: "1",
      fileName: "photo.png",
      mimeType: "image/png",
      subType: "generic",
      path: "public/space/1/Ads-Campaign/Creatives/abc123",
    })

    expect(result.ok).toBe(false)
  })

  test("REJECTS a percent-encoded separator that decodes into the privileged prefix", () => {
    // S3 may decode %2F -> "/", slipping the object into the ads-creative
    // namespace past a literal `includes` check.
    for (const path of [
      "public/space/1/ads-campaign%2Fcreatives%2Fabc123",
      "public/space/1/ads-campaign%2fcreatives%2fabc123",
    ]) {
      const result = handler({
        workspaceId: "1",
        fileName: "photo.png",
        mimeType: "image/png",
        subType: "generic",
        path,
      })
      expect(result.ok).toBe(false)
    }
  })
})
