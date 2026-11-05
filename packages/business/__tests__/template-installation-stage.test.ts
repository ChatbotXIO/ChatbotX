// @vitest-environment node

import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findTenant: vi.fn(),
  findWithTemplate: vi.fn(),
  pinVersionNumber: vi.fn(),
  create: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  tenantRepository: { findById: mocks.findTenant },
  tenantDefaultTemplateRepository: { findWithTemplate: mocks.findWithTemplate },
  templateVersionRepository: { pinVersionNumber: mocks.pinVersionNumber },
  templateInstallationRepository: { create: mocks.create },
}))
vi.mock("../src/logger", () => ({ logger: { warn: mocks.warn } }))

const { stageTenantDefaultInstall } = await import(
  "../src/template/installation-stage"
)

const KEY = "share-token"
const PUBLISHER_REF = /^[0-9a-f]{32}$/
const tx = {} as never
const input = { workspaceId: "200", tenantId: "10" }

const config = async (templateOver: Record<string, unknown> = {}) => ({
  keyHash: await sha256Hex(KEY),
  template: {
    id: "55",
    tenantId: "10",
    name: "Starter",
    workspaceId: "3",
    formatVersion: 2,
    version: 4,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
    shareEnabled: true,
    shareExpiresAt: null,
    shareToken: KEY,
    defaultPermissions: { allowEdit: false, allowDelete: false },
    defaultAutoUpdate: true,
    ...templateOver,
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findTenant.mockResolvedValue({
    id: "10",
    ownerId: "7",
    status: "active",
  })
  mocks.pinVersionNumber.mockResolvedValue(4)
  mocks.create.mockImplementation((values: object) =>
    Promise.resolve({ ...values, id: "900" }),
  )
})

describe("stageTenantDefaultInstall", () => {
  test("does nothing for a tenant without a default", async () => {
    mocks.findWithTemplate.mockResolvedValue(null)

    expect(await stageTenantDefaultInstall(tx, input)).toBeNull()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  test("skips a suspended or missing tenant before reading the config", async () => {
    mocks.findTenant.mockResolvedValue({ id: "10", status: "suspended" })
    expect(await stageTenantDefaultInstall(tx, input)).toBeNull()

    mocks.findTenant.mockResolvedValue(undefined)
    expect(await stageTenantDefaultInstall(tx, input)).toBeNull()

    expect(mocks.findWithTemplate).not.toHaveBeenCalled()
  })

  test("stages a pending tenantDefault install with no installer, the publisher granted", async () => {
    mocks.findWithTemplate.mockResolvedValue(await config())

    expect(await stageTenantDefaultInstall(tx, input)).toBe("900")

    expect(mocks.pinVersionNumber).toHaveBeenCalledWith(
      { templateId: "55", requestedVersion: 4 },
      tx,
    )
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "200",
        templateId: "55",
        sourceTemplateId: "55",
        templateName: "Starter",
        sourceWorkspaceId: "3",
        formatVersion: 2,
        sourceVersion: 4,
        status: "pending",
        autoUpdate: true,
        permissions: { allowEdit: false, allowDelete: false },
        sourceUpdatedAt: new Date("2026-01-01T00:00:00Z"),
        installedBy: null,
        installedByKind: "apiToken",
        installSource: "tenantDefault",
        publisherUninstallGrant: 1,
        publisherRef: expect.stringMatching(PUBLISHER_REF),
      }),
      tx,
    )
  })

  test("pins the version the pin primitive returns, not the one it was asked for", async () => {
    mocks.findWithTemplate.mockResolvedValue(await config())
    mocks.pinVersionNumber.mockResolvedValue(9)

    await stageTenantDefaultInstall(tx, input)

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceVersion: 9 }),
      tx,
    )
  })

  test.each([
    ["deleted", { deletedAt: new Date() }, "templateUnavailable"],
    ["from another tenant", { tenantId: "99" }, "templateUnavailable"],
    ["not shared", { shareEnabled: false }, "shareDisabled"],
    ["key rotated", { shareToken: "rotated" }, "keyRotated"],
  ])("skips and logs a template that is %s", async (_name, over, status) => {
    mocks.findWithTemplate.mockResolvedValue(await config(over))

    expect(await stageTenantDefaultInstall(tx, input)).toBeNull()

    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "10", workspaceId: "200", status }),
      expect.any(String),
    )
  })

  test("lets an operational failure abort the workspace creation", async () => {
    mocks.findWithTemplate.mockResolvedValue(await config())
    mocks.create.mockRejectedValue(new Error("deadlock detected"))

    await expect(stageTenantDefaultInstall(tx, input)).rejects.toThrow(
      "deadlock detected",
    )
  })
})
