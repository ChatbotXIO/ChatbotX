// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { GET } from "../src/app/(no-sidebar)/space/[workspaceId]/flows/[id]/export/route"

const { mockBuildExport, mockGetCurrentUserAndTargetWorkspace } = vi.hoisted(
  () => ({
    mockBuildExport: vi.fn(),
    mockGetCurrentUserAndTargetWorkspace: vi.fn(),
  }),
)

vi.mock("@chatbotx.io/business", () => ({
  flowService: { buildExport: mockBuildExport },
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
}))

const ALLOWED_MEMBER = {
  targetWorkspaceMember: { permissions: { flows: true } },
}

const callRoute = (workspaceId: string, id: string) =>
  GET(new Request(`http://localhost/space/${workspaceId}/flows/${id}/export`), {
    params: Promise.resolve({ workspaceId, id }),
  })

// What goes into the export (published graph, field manifests, the draft
// option) is covered by `flowService.buildExport`'s own tests in
// packages/business; this suite covers the route's access and HTTP mapping.
describe("flow export route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue(ALLOWED_MEMBER)
  })

  test("denies access with a bare 404 when the user lacks permission", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspaceMember: { permissions: {} },
    })

    const response = await callRoute("1", "2")

    expect(response.status).toBe(404)
    expect(mockBuildExport).not.toHaveBeenCalled()
  })

  test("returns 404 when the flow does not exist", async () => {
    mockBuildExport.mockResolvedValue({ ok: false, reason: "notFound" })

    expect((await callRoute("1", "2")).status).toBe(404)
  })

  test("returns a distinct notPublished error instead of a blank 404", async () => {
    mockBuildExport.mockResolvedValue({ ok: false, reason: "notPublished" })

    const response = await callRoute("1", "2")

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ code: "notPublished" })
  })

  test("downloads the export as a JSON attachment", async () => {
    mockBuildExport.mockResolvedValue({
      ok: true,
      fileName: "onboarding.chatbotx-flow.json",
      envelope: { formatVersion: 2 },
    })

    const response = await callRoute("1", "2")

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="onboarding.chatbotx-flow.json"',
    )
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    await expect(response.json()).resolves.toEqual({ formatVersion: 2 })
    expect(mockBuildExport).toHaveBeenCalledWith({
      workspaceId: "1",
      id: "2",
    })
  })
})
