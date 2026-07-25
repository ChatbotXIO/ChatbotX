// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const buildMeExport = vi.fn()
const loadServableWorkspace = vi.fn()

vi.mock("@chatbotx.io/business/system-field", () => ({
  systemFieldService: {
    buildMeExport,
  },
}))

vi.mock("@/lib/workspace/load-servable-workspace", () => ({
  loadServableWorkspace,
}))

const { GET } = await import("../src/app/extensions/me/download/route")

describe("me extension download route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadServableWorkspace.mockResolvedValue({ servable: true })
  })

  test("returns export JSON with an attachment filename", async () => {
    buildMeExport.mockResolvedValue({
      data: {
        id: "source/1",
        first_name: "Ada",
        last_name: "Lovelace",
        full_name: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+84901234567",
        locale: "en_GB",
        timezone: "7",
        gender: "Female",
        profile_pic: "https://cdn.example/avatar.png",
      },
      messages: ["newest", "older"],
      generated: "2026-07-09 02:00:00 (UTC)",
    })

    const res = await GET(
      new Request(
        "http://localhost/extensions/me/download?w=workspace-1&u=source%2F1&ib=integration-1&id=form-1&hash=hash-1",
      ),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="source_1.json"',
    )
    await expect(res.json()).resolves.toEqual({
      data: {
        id: "source/1",
        first_name: "Ada",
        last_name: "Lovelace",
        full_name: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+84901234567",
        locale: "en_GB",
        timezone: "7",
        gender: "Female",
        profile_pic: "https://cdn.example/avatar.png",
      },
      messages: ["newest", "older"],
      generated: "2026-07-09 02:00:00 (UTC)",
    })
    expect(buildMeExport).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      sourceId: "source/1",
      integrationId: "integration-1",
      formId: "form-1",
      hash: "hash-1",
    })
  })

  test("returns 404 when required params are missing or invalid", async () => {
    const missing = await GET(
      new Request("http://localhost/extensions/me/download?w=workspace-1"),
    )
    expect(missing.status).toBe(404)
    expect(buildMeExport).not.toHaveBeenCalled()

    buildMeExport.mockResolvedValue(null)
    const invalid = await GET(
      new Request(
        "http://localhost/extensions/me/download?w=workspace-1&u=source-1&ib=integration-1&id=form-1&hash=bad",
      ),
    )
    expect(invalid.status).toBe(404)
  })

  test("returns 410 without building export when the workspace is scheduled for deletion", async () => {
    loadServableWorkspace.mockResolvedValue({ servable: false })

    const res = await GET(
      new Request(
        "http://localhost/extensions/me/download?w=workspace-1&u=source-1&ib=integration-1&id=form-1&hash=hash-1",
      ),
    )

    expect(res.status).toBe(410)
    expect(buildMeExport).not.toHaveBeenCalled()
  })
})
