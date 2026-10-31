// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ findOrFail: vi.fn() }))

vi.mock("../src/workspace", () => ({
  workspaceService: { findOrFail: mocks.findOrFail },
}))

const { assertTemplateInstallable } = await import(
  "../src/template/installability"
)

const actor = { kind: "apiToken", permission: "full" } as const

const v1Payload = {
  formatVersion: 1,
  exportedAt: "2025-01-01T00:00:00.000Z",
  source: { workspaceId: "1", tenantId: "1" },
  manifests: {},
  resources: {
    flows: [
      {
        sourceId: "flow-1",
        name: "Welcome",
        active: true,
        enableInInbox: true,
        startNodeId: "n1",
        nodes: [],
        edges: [],
        folderId: null,
      },
    ],
  },
}

const templateOf = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "t-1",
    tenantId: "1",
    shareEnabled: true,
    shareExpiresAt: null,
    payload: v1Payload,
    ...overrides,
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findOrFail.mockResolvedValue({ id: "ws-target", tenantId: "1" })
})

describe("assertTemplateInstallable", () => {
  test("refuses an install into a workspace of another tenant with templateCrossTenantInstall", async () => {
    mocks.findOrFail.mockResolvedValue({ id: "ws-target", tenantId: "7" })

    await expect(
      assertTemplateInstallable({
        template: templateOf(),
        targetWorkspaceId: "ws-target",
        actor,
      }),
    ).rejects.toMatchObject({ code: "templateCrossTenantInstall" })
  })

  test("compares against the target workspace's tenant, not the template's source workspace", async () => {
    await assertTemplateInstallable({
      template: templateOf({ tenantId: "1" }),
      targetWorkspaceId: "ws-target",
      actor,
    })

    expect(mocks.findOrFail).toHaveBeenCalledWith({
      where: { id: "ws-target" },
    })
  })

  test("hides a missing or unshared template as templateShareDisabled before any tenant lookup", async () => {
    for (const template of [
      undefined,
      templateOf({ shareEnabled: false }),
      templateOf({ shareExpiresAt: new Date(Date.now() - 1000) }),
    ]) {
      await expect(
        assertTemplateInstallable({
          template,
          targetWorkspaceId: "ws-target",
          actor,
        }),
      ).rejects.toMatchObject({ code: "templateShareDisabled" })
    }
    expect(mocks.findOrFail).not.toHaveBeenCalled()
  })

  test("installs a legacy v1 payload (no v2 manifests or permissions)", async () => {
    const result = await assertTemplateInstallable({
      template: templateOf(),
      targetWorkspaceId: "ws-target",
      actor,
    })

    expect(result.payload.formatVersion).toBe(1)
    expect(result.payload.resources.flows).toHaveLength(1)
    expect(result.payload.resources.sequences).toEqual([])
  })

  test("rejects a payload the reader cannot parse as templatePayloadIncompatible", async () => {
    await expect(
      assertTemplateInstallable({
        template: templateOf({ payload: { formatVersion: 99 } }),
        targetWorkspaceId: "ws-target",
        actor,
      }),
    ).rejects.toMatchObject({ code: "templatePayloadIncompatible" })
  })
})
