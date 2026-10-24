import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ChatbotXException } from "../src/errors"
import { platformAdminService } from "../src/platform-admin/service"

const mocks = vi.hoisted(() => ({
  deleteByUserId: vi.fn(),
  ensureBootstrapPlan: vi.fn(),
  findIdByEmail: vi.fn(),
  generateTemporaryPassword: vi.fn(async () => ({
    hashedPassword: "hashed",
    initialPassword: "temp-pass-123456",
  })),
  insertIgnore: vi.fn(),
  insertWithCredential: vi.fn(),
  loggerInfo: vi.fn(),
  resolvePlatformSettings: vi.fn(async () => ({
    accountCredentialsEmailTemplate: null,
    appUrl: "https://app.test/",
    logoLightUrl: "https://app.test/logo.svg",
    name: "ChatbotX",
  })),
  resolvePlatformSmtpTransport: vi.fn(),
  sendAccountCredentials: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  platformAdminRepository: {
    deleteByUserId: mocks.deleteByUserId,
    insertIgnore: mocks.insertIgnore,
  },
  userRepository: {
    findIdByEmail: mocks.findIdByEmail,
    insertWithCredential: mocks.insertWithCredential,
  },
}))
vi.mock("@chatbotx.io/mail", () => ({
  DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT: "Your ChatbotX account is ready",
  sendAccountCredentials: mocks.sendAccountCredentials,
}))
vi.mock("../src/logger", () => ({
  logger: { info: mocks.loggerInfo },
}))
vi.mock("../src/platform/settings", () => ({
  resolvePlatformSettings: mocks.resolvePlatformSettings,
}))
vi.mock("../src/platform/smtp", () => ({
  resolvePlatformSmtpTransport: mocks.resolvePlatformSmtpTransport,
}))
vi.mock("../src/user-quota/service", () => ({
  userQuotaService: { ensureBootstrapPlan: mocks.ensureBootstrapPlan },
}))
vi.mock("../src/user/temporary-password", () => ({
  generateTemporaryPassword: mocks.generateTemporaryPassword,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolvePlatformSmtpTransport.mockResolvedValue(undefined)
  mocks.sendAccountCredentials.mockResolvedValue(undefined)
})

describe("platformAdminService.add", () => {
  test("normalizes an existing root user's email before granting admin", async () => {
    const admin = { id: "admin-1", userId: "user-1", role: "super-admin" }
    mocks.findIdByEmail.mockResolvedValue({ id: "user-1" })
    mocks.insertIgnore.mockResolvedValue(admin)

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: " Admin@Example.COM ",
      }),
    ).resolves.toBe(admin)

    expect(mocks.findIdByEmail).toHaveBeenCalledWith({
      email: "admin@example.com",
      tenantId: "1",
    })
    expect(mocks.sendAccountCredentials).not.toHaveBeenCalled()
    expect(mocks.insertWithCredential).not.toHaveBeenCalled()
    expect(mocks.insertIgnore).toHaveBeenCalledWith({ userId: "user-1" })
  })

  test("creates the user, mails credentials, then grants admin", async () => {
    const admin = { id: "admin-2", userId: "user-2", role: "super-admin" }
    mocks.findIdByEmail.mockResolvedValue(undefined)
    mocks.insertWithCredential.mockResolvedValue({
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
      undefined,
    )
    expect(mocks.sendAccountCredentials.mock.calls[0]).toHaveLength(3)
    expect(mocks.insertWithCredential).toHaveBeenCalledWith({
      email: "new@example.com",
      hashedPassword: "hashed",
      tenantId: "1",
    })
    expect(mocks.ensureBootstrapPlan).toHaveBeenCalledWith({
      tenantId: "1",
      userId: "user-2",
    })
    expect(mocks.insertIgnore).toHaveBeenCalledWith({ userId: "user-2" })
  })

  test("does not create a user when the credentials email fails", async () => {
    mocks.findIdByEmail.mockResolvedValue(undefined)
    mocks.sendAccountCredentials.mockRejectedValue(
      new Error("SMTP unavailable"),
    )

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: "failed@example.com",
      }),
    ).rejects.toThrow("SMTP unavailable")

    expect(mocks.insertWithCredential).not.toHaveBeenCalled()
    expect(mocks.insertIgnore).not.toHaveBeenCalled()
  })

  test("does not claim provisioning when a concurrent insert wins", async () => {
    const admin = { id: "admin-3", userId: "user-3", role: "super-admin" }
    mocks.findIdByEmail.mockResolvedValue(undefined)
    mocks.insertWithCredential.mockResolvedValue({
      created: false,
      userId: "user-3",
    })
    mocks.insertIgnore.mockResolvedValue(admin)

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: "raced@example.com",
      }),
    ).resolves.toBe(admin)

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ provisioned: false, userId: "user-3" }),
      "added platform admin",
    )
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

  test("raises a typed conflict when the assigned admin disappears", async () => {
    mocks.findIdByEmail.mockResolvedValue({ id: "user-1" })
    mocks.insertIgnore.mockResolvedValue(undefined)

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: "admin@example.com",
      }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "platformAdminAssignmentConflict",
      httpStatusCode: 409,
    })
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
