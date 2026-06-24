import { beforeEach, describe, expect, test, vi } from "vitest"

/**
 * Hoisted mock handles. `vi.mock` factories run before module top-level, so any
 * value a factory references must be created with `vi.hoisted`.
 */
const {
  findDecryptedForUser,
  resolveTenantForOwner,
  resolveTenantSettingsByOwner,
  sendAccountCredentials,
  userFindFirst,
  insertValues,
  insertReturning,
} = vi.hoisted(() => ({
  findDecryptedForUser: vi.fn(),
  resolveTenantForOwner: vi.fn(),
  resolveTenantSettingsByOwner: vi.fn(),
  sendAccountCredentials: vi.fn(),
  userFindFirst: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
}))

// Minimal ChatbotXException so `instanceof` / message assertions work without
// pulling the real business error module graph.
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
  platformCredentialService: { findDecryptedForUser },
  workspaceService: { resolveTenantForOwner },
  resolveTenantSettingsByOwner,
}))

vi.mock("@chatbotx.io/mail", () => ({
  DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT: "Your {{brandName}} account is ready",
  sendAccountCredentials,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  accountModel: { id: "Account.id" },
  userModel: { id: "User.id" },
}))

// `db.query.userModel.findFirst` drives idempotency; `db.transaction(cb)` runs
// the callback with a tx whose insert chain is captured by the hoisted spies.
vi.mock("@chatbotx.io/database/client", () => {
  const tx = {
    insert: () => ({
      values: (vals: unknown) => {
        insertValues(vals)
        return { returning: () => insertReturning() }
      },
    }),
  }
  return {
    db: {
      query: { userModel: { findFirst: userFindFirst } },
      transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
    },
    isUniqueViolationError: (error: unknown) =>
      (error as { code?: string } | null)?.code === "23505",
  }
})

vi.mock("better-auth/crypto", () => ({
  generateRandomString: () => "TempPass123456AB",
  hashPassword: (p: string) => Promise.resolve(`hashed:${p}`),
}))

import { provisionResellerAccount } from "../src/provisioning"

const SMTP_CONFIG = {
  host: "smtp.reseller.test",
  port: 587,
  username: "mailer@reseller.test",
  password: "smtp-secret",
  fromEmail: "no-reply@reseller.test",
  fromName: "Reseller Co",
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveTenantForOwner.mockResolvedValue("42")
  resolveTenantSettingsByOwner.mockResolvedValue({
    name: "Reseller Co",
    logoLightUrl: "https://reseller.test/logo.svg",
    appUrl: "https://app.reseller.test",
  })
})

describe("provisionResellerAccount", () => {
  test("hard-fails before creating anything when the reseller has no SMTP credential", async () => {
    findDecryptedForUser.mockResolvedValue(undefined)

    await expect(
      provisionResellerAccount({
        resellerUserId: "owner-1",
        email: "customer@example.com",
        name: "Customer",
      }),
    ).rejects.toMatchObject({ code: "smtpCredentialMissing" })

    expect(userFindFirst).not.toHaveBeenCalled()
    expect(insertValues).not.toHaveBeenCalled()
    expect(sendAccountCredentials).not.toHaveBeenCalled()
  })

  test("creates a tenant-scoped, must-change-password account and emails credentials over the reseller transport", async () => {
    findDecryptedForUser.mockResolvedValue({ config: SMTP_CONFIG })
    userFindFirst.mockResolvedValue(undefined)
    insertReturning.mockResolvedValue([{ id: "new-user-9" }])

    const result = await provisionResellerAccount({
      resellerUserId: "owner-1",
      email: "customer@example.com",
      name: "Customer",
    })

    expect(result).toEqual({ userId: "new-user-9", alreadyExisted: false })

    // User row: tenant-scoped + forced change.
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "customer@example.com",
        name: "Customer",
        emailVerified: true,
        mustChangePassword: true,
        tenantId: "42",
      }),
    )
    // Account row: credential provider, hashed password, same tenant.
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "new-user-9",
        providerId: "credential",
        password: "hashed:TempPass123456AB",
        userId: "new-user-9",
        tenantId: "42",
      }),
    )
    // Email sent over the reseller's own SMTP, with the plaintext temp password.
    expect(sendAccountCredentials).toHaveBeenCalledWith(
      "customer@example.com",
      expect.objectContaining({
        loginEmail: "customer@example.com",
        initialPassword: "TempPass123456AB",
        brandName: "Reseller Co",
        signInUrl: "https://app.reseller.test/auth/sign-in",
      }),
      expect.objectContaining({
        host: "smtp.reseller.test",
        fromEmail: "no-reply@reseller.test",
        fromName: "Reseller Co",
      }),
    )
  })

  test("is idempotent: an existing account is not recreated and no email is re-sent", async () => {
    findDecryptedForUser.mockResolvedValue({ config: SMTP_CONFIG })
    userFindFirst.mockResolvedValue({ id: "existing-user-3" })

    const result = await provisionResellerAccount({
      resellerUserId: "owner-1",
      email: "customer@example.com",
      name: "Customer",
    })

    expect(result).toEqual({ userId: "existing-user-3", alreadyExisted: true })
    expect(insertValues).not.toHaveBeenCalled()
    expect(sendAccountCredentials).not.toHaveBeenCalled()
  })

  test("resolves a concurrent insert race to alreadyExisted instead of a raw unique violation", async () => {
    findDecryptedForUser.mockResolvedValue({ config: SMTP_CONFIG })
    // First read (idempotency check) finds nothing; the concurrent winner commits
    // before our insert, so the insert hits the unique index. The catch path
    // re-reads and finds the raced row.
    userFindFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "raced-user-7" })
    insertReturning.mockRejectedValue({ code: "23505" })

    const result = await provisionResellerAccount({
      resellerUserId: "owner-1",
      email: "customer@example.com",
      name: "Customer",
    })

    expect(result).toEqual({ userId: "raced-user-7", alreadyExisted: true })
    expect(userFindFirst).toHaveBeenCalledTimes(2)
  })

  test("sends the credentials email before committing the account (no orphan on SMTP failure)", async () => {
    findDecryptedForUser.mockResolvedValue({ config: SMTP_CONFIG })
    userFindFirst.mockResolvedValue(undefined)
    // SMTP send fails — the account must NOT have been created yet.
    sendAccountCredentials.mockRejectedValue(new Error("SMTP host unreachable"))

    await expect(
      provisionResellerAccount({
        resellerUserId: "owner-1",
        email: "customer@example.com",
        name: "Customer",
      }),
    ).rejects.toThrow("SMTP host unreachable")

    // Email was attempted, but no rows were written — a retry can re-provision.
    expect(sendAccountCredentials).toHaveBeenCalledTimes(1)
    expect(insertValues).not.toHaveBeenCalled()
  })
})
