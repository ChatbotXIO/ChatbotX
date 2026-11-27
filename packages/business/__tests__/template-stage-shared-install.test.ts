// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findForStaging: vi.fn(),
  create: vi.fn(),
  pinVersionNumber: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  templateRepository: { findForStagingByShareToken: mocks.findForStaging },
  templateInstallationRepository: { create: mocks.create },
  templateVersionRepository: { pinVersionNumber: mocks.pinVersionNumber },
  tenantDefaultTemplateRepository: {},
  tenantRepository: {},
}))
vi.mock("../src/logger", () => ({ logger: { warn: mocks.warn } }))

const { stageSharedTemplateInstall } = await import(
  "../src/template/installation-stage"
)

const tx = {} as never
const input = {
  workspaceId: "200",
  tenantId: "10",
  createdBy: "7",
  shareToken: "tok",
}
const template = (overrides: Record<string, unknown> = {}) => ({
  id: "55",
  tenantId: "10",
  name: "Starter",
  workspaceId: "3",
  formatVersion: 2,
  version: 4,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  shareEnabled: true,
  shareExpiresAt: null,
  defaultPermissions: { allowEdit: true, allowDelete: true },
  defaultAutoUpdate: false,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pinVersionNumber.mockResolvedValue(4)
  mocks.create.mockImplementation((values: object) =>
    Promise.resolve({ ...values, id: "900" }),
  )
})

describe("stageSharedTemplateInstall", () => {
  test("stages the link's template as the creator's own install, the publisher granted", async () => {
    mocks.findForStaging.mockResolvedValue(template())

    await expect(stageSharedTemplateInstall(tx, input)).resolves.toBe("900")

    expect(mocks.pinVersionNumber).toHaveBeenCalledWith(
      { templateId: "55", requestedVersion: 4 },
      tx,
    )
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "200",
        templateId: "55",
        status: "pending",
        sourceVersion: 4,
        installedBy: "7",
        installedByKind: "member",
        installSource: "manual",
        publisherUninstallGrant: 1,
      }),
      tx,
    )
  })

  test("a platform template goes into a white-label workspace", async () => {
    mocks.findForStaging.mockResolvedValue(template({ tenantId: "1" }))

    await expect(stageSharedTemplateInstall(tx, input)).resolves.toBe("900")
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ publisherUninstallGrant: 0 }),
      tx,
    )
  })

  test.each([
    ["a link that no longer finds a template", null],
    ["a switched-off share", template({ shareEnabled: false })],
    ["an expired share", template({ shareExpiresAt: new Date(0) })],
    ["another white-label's template", template({ tenantId: "11" })],
  ])("skips %s, leaving the workspace to the default", async (_name, row) => {
    mocks.findForStaging.mockResolvedValue(row)

    await expect(stageSharedTemplateInstall(tx, input)).resolves.toBeNull()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalled()
  })
})
