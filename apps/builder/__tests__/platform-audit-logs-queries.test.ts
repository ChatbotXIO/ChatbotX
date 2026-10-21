// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  listPlatformAuditLogs,
  listPlatformAuditWorkspaces,
} from "../src/enterprise/features/platform-audit-logs/queries"
import type { ListPlatformAuditLogsRequest } from "../src/enterprise/features/platform-audit-logs/schema/query"

const NOT_FOUND_SENTINEL = new Error("NOT_FOUND_SENTINEL")
const LICENSE_ERROR = new Error("No valid enterprise license")

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  assertEnterpriseFeatures: vi.fn(),
  listWorkspaces: vi.fn(),
  listPlatformAuditLogsService: vi.fn(),
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUser: mocks.getCurrentUser,
}))
vi.mock("@chatbotx.io/business", () => ({
  assertEnterpriseFeatures: mocks.assertEnterpriseFeatures,
  isSuperAdmin: mocks.isSuperAdmin,
  workspaceSupportAccessService: { listWorkspaces: mocks.listWorkspaces },
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  listPlatformAuditLogs: mocks.listPlatformAuditLogsService,
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND_SENTINEL
  },
}))

const baseInput: ListPlatformAuditLogsRequest = {
  page: 1,
  perPage: 10,
  from: "2024-01-01",
  to: "2024-01-02",
  keyword: "",
  sort: [{ id: "createdAt", desc: true }],
  workspaceId: "",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertEnterpriseFeatures.mockResolvedValue(undefined)
})

describe("listPlatformAuditLogs", () => {
  test("throws notFound without a current user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)

    await expect(listPlatformAuditLogs(baseInput)).rejects.toBe(
      NOT_FOUND_SENTINEL,
    )
    expect(mocks.listPlatformAuditLogsService).not.toHaveBeenCalled()
  })

  test("throws notFound for a non-super-admin user", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" })
    mocks.isSuperAdmin.mockResolvedValue(false)

    await expect(listPlatformAuditLogs(baseInput)).rejects.toBe(
      NOT_FOUND_SENTINEL,
    )
    expect(mocks.listPlatformAuditLogsService).not.toHaveBeenCalled()
  })

  test("rejects when the license check fails", async () => {
    mocks.assertEnterpriseFeatures.mockRejectedValue(LICENSE_ERROR)

    await expect(listPlatformAuditLogs(baseInput)).rejects.toBe(LICENSE_ERROR)
    expect(mocks.getCurrentUser).not.toHaveBeenCalled()
    expect(mocks.listPlatformAuditLogsService).not.toHaveBeenCalled()
  })

  test("lists audit logs across workspaces for a super admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1" })
    mocks.isSuperAdmin.mockResolvedValue(true)
    mocks.listPlatformAuditLogsService.mockResolvedValue({
      data: [],
      pageCount: 0,
    })

    await expect(listPlatformAuditLogs(baseInput)).resolves.toEqual({
      data: [],
      pageCount: 0,
    })
    expect(mocks.listPlatformAuditLogsService).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: undefined,
        page: 1,
        perPage: 10,
        keyword: "",
      }),
    )
  })
})

describe("listPlatformAuditWorkspaces", () => {
  test("throws notFound without a current user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)

    await expect(listPlatformAuditWorkspaces()).rejects.toBe(NOT_FOUND_SENTINEL)
    expect(mocks.listWorkspaces).not.toHaveBeenCalled()
  })

  test("throws notFound for a non-super-admin user", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" })
    mocks.isSuperAdmin.mockResolvedValue(false)

    await expect(listPlatformAuditWorkspaces()).rejects.toBe(NOT_FOUND_SENTINEL)
    expect(mocks.listWorkspaces).not.toHaveBeenCalled()
  })

  test("rejects when the license check fails", async () => {
    mocks.assertEnterpriseFeatures.mockRejectedValue(LICENSE_ERROR)

    await expect(listPlatformAuditWorkspaces()).rejects.toBe(LICENSE_ERROR)
    expect(mocks.listWorkspaces).not.toHaveBeenCalled()
  })

  test("maps workspaces to options for a super admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1" })
    mocks.isSuperAdmin.mockResolvedValue(true)
    mocks.listWorkspaces.mockResolvedValue({
      data: [{ id: "w1", name: "Workspace One" }],
      pageCount: 1,
    })

    await expect(listPlatformAuditWorkspaces()).resolves.toEqual([
      { id: "w1", label: "Workspace One" },
    ])
    expect(mocks.listWorkspaces).toHaveBeenCalledWith({
      page: 1,
      perPage: 200,
    })
  })
})
