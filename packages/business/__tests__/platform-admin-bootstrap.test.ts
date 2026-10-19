import { beforeEach, describe, expect, test, vi } from "vitest"
import { platformAdminService } from "../src/platform-admin/service"

const mocks = vi.hoisted(() => ({
  bootstrapRootAdmin: vi.fn(),
  findRootUserByEmail: vi.fn(),
  keys: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  platformAdminRepository: {
    bootstrapRootAdmin: mocks.bootstrapRootAdmin,
    findRootUserByEmail: mocks.findRootUserByEmail,
  },
}))
vi.mock("../src/keys", () => ({ keys: mocks.keys }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.keys.mockReturnValue({ PLATFORM_ADMIN_EMAIL: undefined })
  mocks.findRootUserByEmail.mockResolvedValue(undefined)
  mocks.bootstrapRootAdmin.mockResolvedValue(false)
})

describe("platformAdminService.provisionBootstrapAdmin", () => {
  test("provisions the configured root-tenant user", async () => {
    mocks.keys.mockReturnValue({ PLATFORM_ADMIN_EMAIL: "admin@example.com" })

    await platformAdminService.provisionBootstrapAdmin({
      email: "admin@example.com",
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

  test("delegates existing-user lookup to the atomic repository bootstrap", async () => {
    mocks.keys.mockReturnValue({ PLATFORM_ADMIN_EMAIL: "admin@example.com" })

    await platformAdminService.provisionBootstrapAdmin()

    expect(mocks.bootstrapRootAdmin).toHaveBeenCalledWith({
      email: "admin@example.com",
    })
    expect(mocks.findRootUserByEmail).not.toHaveBeenCalled()
  })

  test("does not query or provision without bootstrap configuration", async () => {
    await platformAdminService.provisionBootstrapAdmin()

    expect(mocks.findRootUserByEmail).not.toHaveBeenCalled()
    expect(mocks.bootstrapRootAdmin).not.toHaveBeenCalled()
  })
})
