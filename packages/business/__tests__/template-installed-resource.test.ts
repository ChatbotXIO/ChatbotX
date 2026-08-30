// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const { mockInstalledResourceFindMany, mockInstallationFindMany } = vi.hoisted(
  () => ({
    mockInstalledResourceFindMany: vi.fn(),
    mockInstallationFindMany: vi.fn(),
  }),
)

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      templateInstalledResourceModel: {
        findMany: mockInstalledResourceFindMany,
      },
      templateInstallationModel: {
        findMany: mockInstallationFindMany,
      },
    },
  },
}))

const { assertDeletable } = await import(
  "../src/template/installed-resource.service"
)

describe("assertDeletable", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("does nothing when resourceIds is empty (never queries the db)", async () => {
    await assertDeletable({
      workspaceId: "ws-1",
      resourceKind: "trigger",
      resourceIds: [],
    })

    expect(mockInstalledResourceFindMany).not.toHaveBeenCalled()
  })

  test("allows deletion when no TemplateInstalledResource row matches (never installed from a template)", async () => {
    mockInstalledResourceFindMany.mockResolvedValue([])

    await expect(
      assertDeletable({
        workspaceId: "ws-1",
        resourceKind: "trigger",
        resourceIds: ["trigger-1"],
      }),
    ).resolves.toBeUndefined()

    expect(mockInstallationFindMany).not.toHaveBeenCalled()
  })

  test("throws when the owning installation has allowDelete: false", async () => {
    mockInstalledResourceFindMany.mockResolvedValue([
      { resourceId: "trigger-1", installationId: "install-1" },
    ])
    mockInstallationFindMany.mockResolvedValue([
      { id: "install-1", permissions: { allowDelete: false, allowEdit: true } },
    ])

    await expect(
      assertDeletable({
        workspaceId: "ws-1",
        resourceKind: "trigger",
        resourceIds: ["trigger-1"],
      }),
    ).rejects.toThrow(
      "This resource was installed from a template that disallows deletion",
    )
  })

  test("allows deletion when the owning installation has allowDelete: true", async () => {
    mockInstalledResourceFindMany.mockResolvedValue([
      { resourceId: "trigger-1", installationId: "install-1" },
    ])
    mockInstallationFindMany.mockResolvedValue([
      { id: "install-1", permissions: { allowDelete: true, allowEdit: true } },
    ])

    await expect(
      assertDeletable({
        workspaceId: "ws-1",
        resourceKind: "trigger",
        resourceIds: ["trigger-1"],
      }),
    ).resolves.toBeUndefined()
  })

  test("queries only wasExisting:false rows so pre-existing resources are never locked", async () => {
    mockInstalledResourceFindMany.mockResolvedValue([])

    await assertDeletable({
      workspaceId: "ws-1",
      resourceKind: "trigger",
      resourceIds: ["trigger-1"],
    })

    expect(mockInstalledResourceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ wasExisting: false }),
      }),
    )
  })
})
