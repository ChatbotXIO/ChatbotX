// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listInstalled: vi.fn(),
  findCategoryCounts: vi.fn(),
  findInstallation: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  templateInstallationSyncRepository: {
    listInstalledResources: mocks.listInstalled,
  },
  templateRepository: { findCategoryCounts: mocks.findCategoryCounts },
  templateInstallationRepository: {
    findByIdAndWorkspace: mocks.findInstallation,
  },
}))

const { assertCanViewInstallation } = await import(
  "../src/template/installation-visibility"
)
const { templateUninstallService } = await import(
  "../src/template/uninstall.service"
)

const installation = { id: "inst-1", sourceTemplateId: "tpl-1" }
const ecommerceOnly = {
  kind: "member" as const,
  permissions: { ecommerce: true },
}
const notFound = expect.objectContaining({ code: "notFound" })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listInstalled.mockResolvedValue([])
  mocks.findCategoryCounts.mockResolvedValue(undefined)
  mocks.findInstallation.mockResolvedValue({
    ...installation,
    workspaceId: "ws-1",
    status: "completed",
  })
})

describe("who sees a template installation", () => {
  test("judged by its copies once it has some", async () => {
    mocks.listInstalled.mockResolvedValue([
      { category: "products" },
      { category: "flows" },
    ])
    await expect(
      assertCanViewInstallation(installation, ecommerceOnly),
    ).rejects.toEqual(notFound)
    expect(mocks.findCategoryCounts).not.toHaveBeenCalled()
  })

  // A pending or early-failed install has no copies yet: its source template
  // says what it is about, so it does not show to every member meanwhile.
  test("judged by its source template while it has no copies", async () => {
    mocks.findCategoryCounts.mockResolvedValue({ flows: 2, products: 0 })
    await expect(
      assertCanViewInstallation(installation, ecommerceOnly),
    ).rejects.toEqual(notFound)

    mocks.findCategoryCounts.mockResolvedValue({ products: 1, flows: 0 })
    await expect(
      assertCanViewInstallation(installation, ecommerceOnly),
    ).resolves.toBeUndefined()
  })

  test("hidden from a restricted member when the source template is gone", async () => {
    await expect(
      assertCanViewInstallation(installation, ecommerceOnly),
    ).rejects.toEqual(notFound)
    await expect(
      assertCanViewInstallation(
        { id: "inst-1", sourceTemplateId: null },
        ecommerceOnly,
      ),
    ).rejects.toEqual(notFound)
  })

  test("a member with every permission and an api token see it without a lookup", async () => {
    await assertCanViewInstallation(installation, {
      kind: "member",
      permissions: { superAdmin: true },
    })
    await assertCanViewInstallation(installation, {
      kind: "apiToken",
      permission: "read_only",
    })
    expect(mocks.listInstalled).not.toHaveBeenCalled()
  })

  test("the installer's uninstall preview applies the same rule", async () => {
    mocks.listInstalled.mockResolvedValue([{ category: "flows" }])
    await expect(
      templateUninstallService.previewAsInstaller({
        workspaceId: "ws-1",
        installationId: "inst-1",
        actor: ecommerceOnly,
      }),
    ).rejects.toEqual(notFound)
  })
})
