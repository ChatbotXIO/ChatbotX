import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ChatbotXException } from "../src/errors"
import { platformAdminService } from "../src/platform-admin/service"

const mocks = vi.hoisted(() => ({
  deleteByUserId: vi.fn(),
  ensureBootstrapPlan: vi.fn(),
  findForAuth: vi.fn(),
  findIdByEmail: vi.fn(),
  generateTemporaryPassword: vi.fn(async () => ({
    hashedPassword: "hashed",
    initialPassword: "temp-pass-123456",
  })),
  insertWithCredential: vi.fn(),
  invalidateByUserId: vi.fn(),
  loggerInfo: vi.fn(),
  resolvePlatformSettings: vi.fn(async () => ({
    accountCredentialsEmailTemplate: null,
    appUrl: "https://app.test/",
    logoLightUrl: "https://app.test/logo.svg",
    name: "ChatbotX",
  })),
  resolvePlatformSmtpTransport: vi.fn(),
  sendAccountCredentials: vi.fn(),
  upsertRole: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  platformAdminRepository: {
    deleteByUserId: mocks.deleteByUserId,
    findForAuth: mocks.findForAuth,
    invalidateByUserId: mocks.invalidateByUserId,
    upsertRole: mocks.upsertRole,
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
  mocks.findForAuth.mockResolvedValue({ role: "super-admin" })
  mocks.resolvePlatformSmtpTransport.mockResolvedValue(undefined)
  mocks.sendAccountCredentials.mockResolvedValue(undefined)
})

describe("platformAdminService.add", () => {
  test("normalizes an existing root user's email before granting the requested role", async () => {
    const admin = { id: "admin-1", userId: "user-1", role: "support" }
    mocks.findIdByEmail.mockResolvedValue({ id: "user-1" })
    mocks.upsertRole.mockResolvedValue(admin)

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: " Admin@Example.COM ",
        role: "support",
      }),
    ).resolves.toBe(admin)

    expect(mocks.findIdByEmail).toHaveBeenCalledWith({
      email: "admin@example.com",
      tenantId: "1",
    })
    expect(mocks.sendAccountCredentials).not.toHaveBeenCalled()
    expect(mocks.insertWithCredential).not.toHaveBeenCalled()
    expect(mocks.upsertRole).toHaveBeenCalledWith({
      role: "support",
      userId: "user-1",
    })
    expect(mocks.invalidateByUserId).toHaveBeenCalledWith("user-1")
  })

  test("creates the user, mails credentials, then grants admin", async () => {
    const admin = { id: "admin-2", userId: "user-2", role: "support" }
    mocks.findIdByEmail.mockResolvedValue(undefined)
    mocks.insertWithCredential.mockResolvedValue({
      created: true,
      userId: "user-2",
    })
    mocks.upsertRole.mockResolvedValue(admin)

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: "new@example.com",
        role: "support",
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
    expect(mocks.upsertRole).toHaveBeenCalledWith({
      role: "support",
      userId: "user-2",
    })
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
        role: "support",
      }),
    ).rejects.toThrow("SMTP unavailable")

    expect(mocks.insertWithCredential).not.toHaveBeenCalled()
    expect(mocks.upsertRole).not.toHaveBeenCalled()
  })

  test("raises a typed conflict when the assigned admin disappears", async () => {
    mocks.findIdByEmail.mockResolvedValue({ id: "user-1" })
    mocks.upsertRole.mockResolvedValue(undefined)

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: "admin@example.com",
        role: "support",
      }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "platformAdminAssignmentConflict",
      httpStatusCode: 409,
    })
  })

  test("does not claim provisioning when a concurrent insert wins", async () => {
    const admin = { id: "admin-3", userId: "user-3", role: "support" }
    mocks.findIdByEmail.mockResolvedValue(undefined)
    mocks.insertWithCredential.mockResolvedValue({
      created: false,
      userId: "user-3",
    })
    mocks.upsertRole.mockResolvedValue(admin)

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: "raced@example.com",
        role: "support",
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
        role: "support",
      }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "invalidEmail",
      httpStatusCode: 400,
    })

    expect(mocks.sendAccountCredentials).not.toHaveBeenCalled()
  })

  test("refuses support administrators from adding administrators", async () => {
    mocks.findForAuth.mockResolvedValue({ role: "support" })

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: "admin@example.com",
        role: "support",
      }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      httpStatusCode: 403,
    })

    expect(mocks.findIdByEmail).not.toHaveBeenCalled()
  })

  test("refuses an administrator from lowering their own role", async () => {
    mocks.findIdByEmail.mockResolvedValue({ id: "actor-1" })

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: "admin@example.com",
        role: "support",
      }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "cannotRemoveSelf",
      httpStatusCode: 400,
    })

    expect(mocks.upsertRole).not.toHaveBeenCalled()
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

  test("refuses support administrators from removing administrators", async () => {
    mocks.findForAuth.mockResolvedValue({ role: "support" })

    await expect(
      platformAdminService.remove({
        actorId: "actor-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      httpStatusCode: 403,
    })

    expect(mocks.deleteByUserId).not.toHaveBeenCalled()
  })

  test("evicts authorization data after removing an administrator", async () => {
    await platformAdminService.remove({
      actorId: "actor-1",
      userId: "user-1",
    })

    expect(mocks.deleteByUserId).toHaveBeenCalledWith("user-1")
    expect(mocks.invalidateByUserId).toHaveBeenCalledWith("user-1")
  })
})
