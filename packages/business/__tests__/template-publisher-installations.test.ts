// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listPublisherRows: vi.fn(),
  templateFindFirst: vi.fn(),
  installAnalytics: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { templateModel: { findFirst: mocks.templateFindFirst } } },
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  templateInstallationModel: {},
  templateModel: {},
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  templateInstallationRepository: {},
  templateRepository: {
    listPublisherRows: mocks.listPublisherRows,
    findLive: mocks.templateFindFirst,
    installAnalytics: mocks.installAnalytics,
    findLiveDetail: mocks.templateFindFirst,
  },
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
// The payload hash looks adapters up for their fingerprints; this test needs none.
vi.mock("../src/template/adapters/registry", () => ({
  getTemplateAdapter: () => undefined,
}))
vi.mock("../src/template/snapshot.service", () => ({
  buildTemplateSnapshot: vi.fn(),
}))

const { templateService } = await import("../src/template/service")

const actor = { kind: "member", permissions: { flows: true } } as const
const row = (ref: string, at: string) => ({
  publisherRef: ref,
  workspaceName: `ws ${ref}`,
  installCount: 1,
  totalInstallEvents: 1,
  lastInstalledAt: new Date(at),
  oldestVersion: 1,
  autoUpdate: false,
  active: true,
  eligibleForUninstall: true,
})
const CURSOR_ALPHABET = /^[A-Za-z0-9_-]+$/
const REF_A = "a".repeat(32)
const REF_B = "b".repeat(32)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.templateFindFirst.mockResolvedValue({ id: "tpl-1" })
})

describe("templateService.listPublisherInstallations", () => {
  test("needs the manage permission", async () => {
    await expect(
      templateService.listPublisherInstallations({
        workspaceId: "ws-1",
        templateId: "tpl-1",
        actor: { kind: "member", permissions: { ecommerce: true } },
      }),
    ).rejects.toMatchObject({ code: "templateManagePermissionDenied" })
    expect(mocks.listPublisherRows).not.toHaveBeenCalled()
  })

  test("returns an opaque cursor only when another page exists", async () => {
    mocks.listPublisherRows.mockResolvedValue([
      row(REF_A, "2026-01-02T00:00:00.000Z"),
      row(REF_B, "2026-01-01T00:00:00.000Z"),
    ])
    const page = await templateService.listPublisherInstallations({
      workspaceId: "ws-1",
      templateId: "tpl-1",
      actor,
      limit: 1,
    })
    expect(page.items).toHaveLength(1)
    expect(page.nextCursor).toMatch(CURSOR_ALPHABET)
    expect(page.nextCursor).not.toContain(REF_A.slice(0, 6))

    mocks.listPublisherRows.mockResolvedValue([
      row(REF_A, "2026-01-02T00:00:00.000Z"),
    ])
    const last = await templateService.listPublisherInstallations({
      workspaceId: "ws-1",
      templateId: "tpl-1",
      actor,
      limit: 5,
    })
    expect(last.nextCursor).toBeNull()
  })

  test("round-trips the cursor into the keyset the repository filters on", async () => {
    mocks.listPublisherRows.mockResolvedValue([
      row(REF_A, "2026-01-02T00:00:00.000Z"),
      row(REF_B, "2026-01-01T00:00:00.000Z"),
    ])
    const first = await templateService.listPublisherInstallations({
      workspaceId: "ws-1",
      templateId: "tpl-1",
      actor,
      limit: 1,
    })
    mocks.listPublisherRows.mockResolvedValue([])
    await templateService.listPublisherInstallations({
      workspaceId: "ws-1",
      templateId: "tpl-1",
      actor,
      cursor: first.nextCursor ?? undefined,
    })
    expect(mocks.listPublisherRows.mock.calls[1][0].after).toEqual({
      lastInstalledAt: new Date("2026-01-02T00:00:00.000Z"),
      publisherRef: REF_A,
    })
  })

  test("rejects a forged cursor", async () => {
    await expect(
      templateService.listPublisherInstallations({
        workspaceId: "ws-1",
        templateId: "tpl-1",
        actor,
        cursor: btoa("nonsense|'; drop table"),
      }),
    ).rejects.toMatchObject({ code: "invalidCursor" })
  })

  test("a template of another workspace is not found", async () => {
    mocks.templateFindFirst.mockResolvedValue(undefined)
    await expect(
      templateService.listPublisherInstallations({
        workspaceId: "ws-1",
        templateId: "tpl-x",
        actor,
      }),
    ).rejects.toThrow("Template not found")
  })
})

describe("read-only API token on publisher reads", () => {
  const readOnly = { kind: "apiToken", permission: "read_only" } as const

  test("may list publisher installations", async () => {
    mocks.listPublisherRows.mockResolvedValue([])
    await expect(
      templateService.listPublisherInstallations({
        workspaceId: "ws-1",
        templateId: "tpl-1",
        actor: readOnly,
      }),
    ).resolves.toMatchObject({ items: [] })
  })

  test("may read install analytics", async () => {
    mocks.installAnalytics.mockResolvedValue({ total: 0 })
    await expect(
      templateService.getInstallAnalytics({
        workspaceId: "ws-1",
        templateId: "tpl-1",
        actor: readOnly,
      }),
    ).resolves.toEqual({ total: 0 })
  })

  test("is refused on a write", async () => {
    await expect(
      templateService.rotateShareToken({
        workspaceId: "ws-1",
        templateId: "tpl-1",
        actor: readOnly,
      }),
    ).rejects.toMatchObject({ code: "templateManagePermissionDenied" })
  })
})
