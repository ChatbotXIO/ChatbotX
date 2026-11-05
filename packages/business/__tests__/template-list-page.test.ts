// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ listPage: vi.fn() }))

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))
vi.mock("@chatbotx.io/database/schema", () => ({}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  templateInstallationRepository: {},
  templateRepository: { listWithInstallCountsPage: mocks.listPage },
  templateSelectableResourceRepository: {},
  templateVersionRepository: {},
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  enqueueFanOutTemplateUpdate: vi.fn(),
}))
vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock("@chatbotx.io/flow-config", () => ({
  parseTemplateExport: (payload: unknown) => ({ ok: true, data: payload }),
}))
vi.mock("../src/workspace", () => ({ workspaceService: {} }))
vi.mock("../src/media-library-file/service", () => ({
  mediaLibraryFileService: {},
}))
vi.mock("../src/workspace-member", () => ({ workspaceMemberService: {} }))
vi.mock("../src/user", () => ({ userService: {} }))
vi.mock("../src/workspace-support-access/resolve-access", () => ({
  resolveWorkspaceAccess: vi.fn(),
}))
vi.mock("../src/template/adapters/registry", () => ({
  getTemplateAdapter: () => undefined,
}))
vi.mock("../src/template/snapshot.service", () => ({
  buildTemplateSnapshot: vi.fn(),
}))

const { templateService } = await import("../src/template/service")
const { encodeSelectableCursor } = await import(
  "../src/template/selectable-cursor"
)

const KEY = "2026-10-30 10:00:00.123456+00"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listPage.mockResolvedValue({ rows: [], hasMore: false })
})

describe("templateService.listPage", () => {
  test("first page: no keyset, default limit 100", async () => {
    await templateService.listPage({ workspaceId: "ws-1" })

    expect(mocks.listPage).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      limit: 100,
      after: undefined,
    })
  })

  test("clamps the limit to 1..100", async () => {
    await templateService.listPage({ workspaceId: "ws-1", limit: 5000 })
    expect(mocks.listPage.mock.calls[0]?.[0].limit).toBe(100)
    await templateService.listPage({ workspaceId: "ws-1", limit: 0 })
    expect(mocks.listPage.mock.calls[1]?.[0].limit).toBe(1)
  })

  test("emits a cursor only when more rows exist, and it round-trips into the keyset", async () => {
    mocks.listPage.mockResolvedValue({
      rows: [{ id: "42", installCount: 0 }],
      hasMore: true,
      lastKey: KEY,
    })
    const page = await templateService.listPage({
      workspaceId: "ws-1",
      limit: 1,
    })
    expect(page.nextCursor).toBe(encodeSelectableCursor({ key: KEY, id: "42" }))

    await templateService.listPage({
      workspaceId: "ws-1",
      cursor: page.nextCursor,
    })
    expect(mocks.listPage.mock.calls[1]?.[0].after).toEqual({
      key: KEY,
      id: "42",
    })
  })

  test("the last page has no cursor", async () => {
    mocks.listPage.mockResolvedValue({
      rows: [{ id: "42", installCount: 0 }],
      hasMore: false,
      lastKey: KEY,
    })
    const page = await templateService.listPage({ workspaceId: "ws-1" })
    expect(page.nextCursor).toBeNull()
  })

  test.each(["not-a-cursor", "12"])("rejects the cursor %s", async (cursor) => {
    await expect(
      templateService.listPage({ workspaceId: "ws-1", cursor }),
    ).rejects.toMatchObject({ code: "invalidCursor" })
    expect(mocks.listPage).not.toHaveBeenCalled()
  })
})
