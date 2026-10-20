import { beforeEach, describe, expect, test, vi } from "vitest"
import { platformAdminService } from "../src/platform-admin/service"

const mocks = vi.hoisted(() => ({
  bootstrapRootAdmin: vi.fn(),
  keys: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  platformAdminRepository: {
    bootstrapRootAdmin: mocks.bootstrapRootAdmin,
  },
}))
vi.mock("../src/keys", () => ({ keys: mocks.keys }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.keys.mockReturnValue({ PLATFORM_ADMIN_EMAIL: undefined })
  mocks.bootstrapRootAdmin.mockResolvedValue(false)
})

describe("platformAdminService.provisionBootstrapAdmin", () => {
  test("normalizes configured and root-user email before provisioning", async () => {
    mocks.keys.mockReturnValue({ PLATFORM_ADMIN_EMAIL: "Admin@Example.com" })

    await platformAdminService.provisionBootstrapAdmin({
      email: "ADMIN@example.COM",
      id: "user-1",
      tenantId: "1",
    })

    expect(mocks.bootstrapRootAdmin).toHaveBeenCalledWith({
      email: "admin@example.com",
    })
  })

  test("does not provision a matching email outside the root tenant", async () => {
    mocks.keys.mockReturnValue({ PLATFORM_ADMIN_EMAIL: "admin@example.com" })

    await platformAdminService.provisionBootstrapAdmin({
      email: "admin@example.com",
      id: "user-1",
      tenantId: "tenant-1",
    })

    expect(mocks.bootstrapRootAdmin).not.toHaveBeenCalled()
  })

  test("delegates the lookup to the atomic repository bootstrap", async () => {
    mocks.keys.mockReturnValue({ PLATFORM_ADMIN_EMAIL: "admin@example.com" })

    await platformAdminService.provisionBootstrapAdmin()

    expect(mocks.bootstrapRootAdmin).toHaveBeenCalledWith({
      email: "admin@example.com",
    })
  })

  test("does not provision without bootstrap configuration", async () => {
    await platformAdminService.provisionBootstrapAdmin()

    expect(mocks.bootstrapRootAdmin).not.toHaveBeenCalled()
  })
})
