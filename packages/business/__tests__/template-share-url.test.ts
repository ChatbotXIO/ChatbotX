// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

const resolveWorkspaceAppUrl = vi.hoisted(() => vi.fn())

vi.mock("../src/platform/settings", () => ({ resolveWorkspaceAppUrl }))

const { resolveTemplateShareUrl } = await import("../src/template/share-url")

describe("resolveTemplateShareUrl", () => {
  test("builds the link on the host serving the workspace", async () => {
    resolveWorkspaceAppUrl.mockResolvedValue("https://bots.reseller.test")

    await expect(
      resolveTemplateShareUrl({
        workspaceId: "ws-1",
        templateId: "55",
        shareToken: "tok",
      }),
    ).resolves.toBe("https://bots.reseller.test/t/template?id=55&key=tok")
    expect(resolveWorkspaceAppUrl).toHaveBeenCalledWith({ workspaceId: "ws-1" })
  })
})
