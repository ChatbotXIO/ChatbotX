import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ChatbotXException } from "../src/errors"
import { platformAdminService } from "../src/platform-admin/service"

const mocks = vi.hoisted(() => ({
  deleteByUserId: vi.fn(),
  ensureBootstrapPlan: vi.fn(),
  findRootUserByEmail: vi.fn(),
  generateRandomString: vi.fn(() => "temp-pass-123456"),
  hashPassword: vi.fn(async () => "hashed"),
  insertIgnore: vi.fn(),
  insertRootUserWithCredential: vi.fn(),
  loggerInfo: vi.fn(),
  resolvePlatformSettings: vi.fn(async () => ({
    accountCredentialsEmailTemplate: null,
    appUrl: "https://app.test/",
    logoLightUrl: "https://app.test/logo.svg",
    name: "ChatbotX",
  })),
  sendAccountCredentials: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  platformAdminRepository: {
    deleteByUserId: mocks.deleteByUserId,
    findRootUserByEmail: mocks.findRootUserByEmail,
    insertIgnore: mocks.insertIgnore,
    insertRootUserWithCredential: mocks.insertRootUserWithCredential,
  },
}))
vi.mock("@chatbotx.io/mail", () => ({
  DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT: "Your ChatbotX account is ready",
  sendAccountCredentials: mocks.sendAccountCredentials,
}))
vi.mock("better-auth/crypto", () => ({
  generateRandomString: mocks.generateRandomString,
  hashPassword: mocks.hashPassword,
}))
vi.mock("../src/logger", () => ({
  logger: { info: mocks.loggerInfo },
}))
vi.mock("../src/platform/settings", () => ({
  resolvePlatformSettings: mocks.resolvePlatformSettings,
}))
vi.mock("../src/user-quota/service", () => ({
  userQuotaService: { ensureBootstrapPlan: mocks.ensureBootstrapPlan },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("platformAdminService.add", () => {
  test("adds a root-tenant user idempotently", async () => {
    const admin = { id: "admin-1", userId: "user-1", role: "super-admin" }
    mocks.findRootUserByEmail.mockResolvedValue({ id: "user-1" })
    mocks.insertIgnore.mockResolvedValue(admin)

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: "admin@example.com",
      }),
    ).resolves.toBe(admin)
    expect(mocks.findRootUserByEmail).toHaveBeenCalledWith("admin@example.com")
    expect(mocks.sendAccountCredentials).not.toHaveBeenCalled()
    expect(mocks.insertRootUserWithCredential).not.toHaveBeenCalled()
    expect(mocks.insertIgnore).toHaveBeenCalledWith({ userId: "user-1" })
  })

  test("creates the user, mails credentials, then grants admin", async () => {
    const admin = { id: "admin-2", userId: "user-2", role: "super-admin" }
    mocks.findRootUserByEmail.mockResolvedValue(undefined)
    mocks.insertRootUserWithCredential.mockResolvedValue({
      created: true,
      userId: "user-2",
    })
    mocks.insertIgnore.mockResolvedValue(admin)

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: "new@example.com",
      }),
    ).resolves.toBe(admin)

    expect(mocks.sendAccountCredentials).toHaveBeenCalledWith(
      "new@example.com",
      expect.objectContaining({
        initialPassword: "temp-pass-123456",
        loginEmail: "new@example.com",
        signInUrl: "https://app.test/auth/sign-in",
      }),
    )
    expect(mocks.sendAccountCredentials.mock.calls[0]).toHaveLength(2)
    expect(mocks.sendAccountCredentials.mock.calls[0]?.[2]).toBeUndefined()
    expect(mocks.insertRootUserWithCredential).toHaveBeenCalledWith({
      email: "new@example.com",
      hashedPassword: "hashed",
    })
    expect(mocks.ensureBootstrapPlan).toHaveBeenCalledWith({
      tenantId: "1",
      userId: "user-2",
    })
    expect(mocks.insertIgnore).toHaveBeenCalledWith({ userId: "user-2" })
  })

  test("does not create a user when the credentials email fails", async () => {
    mocks.findRootUserByEmail.mockResolvedValue(undefined)
    mocks.sendAccountCredentials.mockRejectedValue(
      new Error("SMTP unavailable"),
    )

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: "failed@example.com",
      }),
    ).rejects.toThrow("SMTP unavailable")

    expect(mocks.insertRootUserWithCredential).not.toHaveBeenCalled()
    expect(mocks.insertIgnore).not.toHaveBeenCalled()
  })

  test("rejects the Facebook placeholder domain", async () => {
    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: "fb-9@facebook.placeholder.invalid",
      }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "invalidEmail",
      httpStatusCode: 400,
    })

    expect(mocks.sendAccountCredentials).not.toHaveBeenCalled()
  })
})

describe("platformAdminService.remove", () => {
  test("refuses self-removal", async () => {
    await expect(
      platformAdminService.remove({ actorId: "user-1", userId: "user-1" }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "cannotRemoveSelf",
      httpStatusCode: 400,
    })
    expect(mocks.deleteByUserId).not.toHaveBeenCalled()
  })
})
