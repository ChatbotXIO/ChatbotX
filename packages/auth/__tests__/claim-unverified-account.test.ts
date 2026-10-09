import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { claimUnverifiedAccountBeforeLink } = await import(
  "../src/claim-unverified-account"
)

const EMAIL_ATTESTING_ERROR = /email-attesting/
const USER_ID = "11728999944477963"
const internalAdapter = {
  findUserById: vi.fn(),
  findAccounts: vi.fn(),
  deleteAccount: vi.fn(async () => undefined),
  listSessions: vi.fn(),
  deleteSessions: vi.fn(async () => undefined),
}
const context = { context: { internalAdapter } } as never
const DID_NOT_ATTEST_ERROR = /did not attest/
const idTokenWith = (claims: Record<string, unknown>) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`
const VERIFIED_TOKEN = idTokenWith({ email_verified: true })
const account = (providerId: string, idToken?: string) =>
  ({
    userId: USER_ID,
    providerId,
    accountId: "sub",
    ...(idToken !== undefined && { idToken }),
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
  internalAdapter.findUserById.mockResolvedValue({
    id: USER_ID,
    emailVerified: false,
  })
  internalAdapter.findAccounts.mockResolvedValue([
    { id: "acc-pwd", providerId: "credential" },
    { id: "acc-fb", providerId: "facebook" },
  ])
  internalAdapter.listSessions.mockResolvedValue([
    { token: "s1" },
    { token: "s2" },
  ])
})

describe("claimUnverifiedAccountBeforeLink", () => {
  test("Google into an unverified user drops every other login method and its sessions", async () => {
    const result = await claimUnverifiedAccountBeforeLink(
      account("google", VERIFIED_TOKEN),
      context,
    )

    expect(result).toBeUndefined()
    expect(internalAdapter.deleteAccount).toHaveBeenCalledTimes(2)
    expect(internalAdapter.deleteAccount).toHaveBeenCalledWith("acc-pwd")
    expect(internalAdapter.deleteAccount).toHaveBeenCalledWith("acc-fb")
    expect(internalAdapter.deleteSessions).toHaveBeenCalledWith(["s1", "s2"])
  })

  test.each([
    ["email_verified is false", idTokenWith({ email_verified: false })],
    ["there is no id token", undefined],
    ["the id token is malformed", "not-a-jwt"],
  ])("Google is refused when %s", async (_label, token) => {
    await expect(
      claimUnverifiedAccountBeforeLink(account("google", token), context),
    ).rejects.toThrow(DID_NOT_ATTEST_ERROR)
    expect(internalAdapter.deleteAccount).not.toHaveBeenCalled()
    expect(internalAdapter.deleteSessions).not.toHaveBeenCalled()
  })

  test("Facebook into an unverified user with existing accounts is refused", async () => {
    await expect(
      claimUnverifiedAccountBeforeLink(account("facebook"), context),
    ).rejects.toThrow(EMAIL_ATTESTING_ERROR)
    expect(internalAdapter.deleteAccount).not.toHaveBeenCalled()
    expect(internalAdapter.deleteSessions).not.toHaveBeenCalled()
  })

  test("is a no-op for a user with no accounts yet (fresh sign-up)", async () => {
    internalAdapter.findAccounts.mockResolvedValue([])
    await claimUnverifiedAccountBeforeLink(account("facebook"), context)
    expect(internalAdapter.deleteAccount).not.toHaveBeenCalled()
    expect(internalAdapter.listSessions).not.toHaveBeenCalled()
  })

  test("is a no-op for an already verified user", async () => {
    internalAdapter.findUserById.mockResolvedValue({
      id: USER_ID,
      emailVerified: true,
    })
    await claimUnverifiedAccountBeforeLink(account("google"), context)
    expect(internalAdapter.findAccounts).not.toHaveBeenCalled()
    expect(internalAdapter.deleteSessions).not.toHaveBeenCalled()
  })

  test("is a no-op for the credential provider itself", async () => {
    await claimUnverifiedAccountBeforeLink(account("credential"), null)
    expect(internalAdapter.findUserById).not.toHaveBeenCalled()
  })

  test("fails closed without an endpoint context", async () => {
    await expect(
      claimUnverifiedAccountBeforeLink(account("google"), null),
    ).rejects.toThrow()
    expect(internalAdapter.findUserById).not.toHaveBeenCalled()
  })

  test("fails closed when the user does not exist", async () => {
    internalAdapter.findUserById.mockResolvedValue(null)
    await expect(
      claimUnverifiedAccountBeforeLink(account("google"), context),
    ).rejects.toThrow()
    expect(internalAdapter.deleteAccount).not.toHaveBeenCalled()
  })

  test("skips the session call when there are no sessions", async () => {
    internalAdapter.listSessions.mockResolvedValue([])
    await claimUnverifiedAccountBeforeLink(
      account("google", VERIFIED_TOKEN),
      context,
    )
    expect(internalAdapter.deleteSessions).not.toHaveBeenCalled()
  })

  test("fails closed: a cleanup failure propagates so the link is refused", async () => {
    internalAdapter.deleteAccount.mockRejectedValueOnce(new Error("db down"))
    await expect(
      claimUnverifiedAccountBeforeLink(
        account("google", VERIFIED_TOKEN),
        context,
      ),
    ).rejects.toThrow("db down")
  })
})
