import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findDecryptedForUser,
  findIdByEmail,
  generateTemporaryPassword,
  insertWithCredential,
  resolveTenantForOwner,
  resolveTenantSettingsByOwner,
  sendAccountCredentials,
} = vi.hoisted(() => ({
  findDecryptedForUser: vi.fn(),
  findIdByEmail: vi.fn(),
  generateTemporaryPassword: vi.fn(),
  insertWithCredential: vi.fn(),
  resolveTenantForOwner: vi.fn(),
  resolveTenantSettingsByOwner: vi.fn(),
  sendAccountCredentials: vi.fn(),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code?: string
    constructor(message: string, code?: string) {
      super(message)
      this.code = code
    }
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  generateTemporaryPassword,
  platformCredentialService: { findDecryptedForUser },
  resolveTenantSettingsByOwner,
  workspaceService: { resolveTenantForOwner },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  userRepository: { findIdByEmail, insertWithCredential },
}))

vi.mock("@chatbotx.io/mail", () => ({
  DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT: "Your {{brandName}} account is ready",
  sendAccountCredentials,
}))

import { provisionResellerAccount } from "../src/provisioning"

const SMTP_CONFIG = {
  fromEmail: "no-reply@reseller.test",
  fromName: "Reseller Co",
  host: "smtp.reseller.test",
  password: "smtp-secret",
  port: 587,
  username: "mailer@reseller.test",
}

beforeEach(() => {
  vi.clearAllMocks()
  generateTemporaryPassword.mockResolvedValue({
    hashedPassword: "hashed:TempPass123456AB",
    initialPassword: "TempPass123456AB",
  })
  resolveTenantForOwner.mockResolvedValue("42")
  resolveTenantSettingsByOwner.mockResolvedValue({
    accountCredentialsEmailTemplate: {
      body: "<mjml>custom credentials</mjml>",
      subject: "Welcome to {{brandName}}",
    },
    appUrl: "https://app.reseller.test",
    logoLightUrl: "https://reseller.test/logo.svg",
    name: "Reseller Co",
  })
})

describe("provisionResellerAccount", () => {
  test("refuses the Facebook placeholder domain before touching anything", async () => {
    await expect(
      provisionResellerAccount({
        resellerUserId: "owner-1",
        email: "fb-42@facebook.placeholder.invalid",
        name: "Customer",
      }),
    ).rejects.toMatchObject({ code: "invalidEmail" })

    expect(findDecryptedForUser).not.toHaveBeenCalled()
    expect(insertWithCredential).not.toHaveBeenCalled()
    expect(sendAccountCredentials).not.toHaveBeenCalled()
  })

  test("hard-fails before creating anything when the reseller has no SMTP credential", async () => {
    findDecryptedForUser.mockResolvedValue(undefined)

    await expect(
      provisionResellerAccount({
        resellerUserId: "owner-1",
        email: "customer@example.com",
        name: "Customer",
      }),
    ).rejects.toMatchObject({ code: "smtpCredentialMissing" })

    expect(findIdByEmail).not.toHaveBeenCalled()
    expect(insertWithCredential).not.toHaveBeenCalled()
    expect(sendAccountCredentials).not.toHaveBeenCalled()
  })

  test("creates a tenant-scoped account and emails credentials over the reseller transport", async () => {
    findDecryptedForUser.mockResolvedValue({ config: SMTP_CONFIG })
    findIdByEmail.mockResolvedValue(undefined)
    insertWithCredential.mockResolvedValue({
      created: true,
      userId: "new-user-9",
    })

    await expect(
      provisionResellerAccount({
        resellerUserId: "owner-1",
        email: "customer@example.com",
        name: "Customer",
      }),
    ).resolves.toEqual({ alreadyExisted: false, userId: "new-user-9" })

    expect(insertWithCredential).toHaveBeenCalledWith({
      email: "customer@example.com",
      hashedPassword: "hashed:TempPass123456AB",
      name: "Customer",
      tenantId: "42",
    })
    expect(sendAccountCredentials).toHaveBeenCalledWith(
      "customer@example.com",
      expect.objectContaining({
        brandName: "Reseller Co",
        customTemplate: {
          body: "<mjml>custom credentials</mjml>",
          subject: "Welcome to {{brandName}}",
        },
        initialPassword: "TempPass123456AB",
        loginEmail: "customer@example.com",
        signInUrl: "https://app.reseller.test/auth/sign-in",
      }),
      expect.objectContaining({
        fromEmail: "no-reply@reseller.test",
        fromName: "Reseller Co",
        host: "smtp.reseller.test",
      }),
    )
  })

  test("is idempotent: an existing account is not recreated and no email is re-sent", async () => {
    findDecryptedForUser.mockResolvedValue({ config: SMTP_CONFIG })
    findIdByEmail.mockResolvedValue({ id: "existing-user-3" })

    await expect(
      provisionResellerAccount({
        resellerUserId: "owner-1",
        email: "customer@example.com",
        name: "Customer",
      }),
    ).resolves.toEqual({ alreadyExisted: true, userId: "existing-user-3" })

    expect(insertWithCredential).not.toHaveBeenCalled()
    expect(sendAccountCredentials).not.toHaveBeenCalled()
  })

  test("returns the concurrent winner as already existing", async () => {
    findDecryptedForUser.mockResolvedValue({ config: SMTP_CONFIG })
    findIdByEmail.mockResolvedValue(undefined)
    insertWithCredential.mockResolvedValue({
      created: false,
      userId: "raced-user-7",
    })

    await expect(
      provisionResellerAccount({
        resellerUserId: "owner-1",
        email: "customer@example.com",
        name: "Customer",
      }),
    ).resolves.toEqual({ alreadyExisted: true, userId: "raced-user-7" })
  })

  test("sends the credentials email before committing the account", async () => {
    findDecryptedForUser.mockResolvedValue({ config: SMTP_CONFIG })
    findIdByEmail.mockResolvedValue(undefined)
    sendAccountCredentials.mockRejectedValue(new Error("SMTP host unreachable"))

    await expect(
      provisionResellerAccount({
        resellerUserId: "owner-1",
        email: "customer@example.com",
        name: "Customer",
      }),
    ).rejects.toThrow("SMTP host unreachable")

    expect(sendAccountCredentials).toHaveBeenCalledTimes(1)
    expect(insertWithCredential).not.toHaveBeenCalled()
  })
})
