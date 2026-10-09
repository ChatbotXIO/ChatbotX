import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { claimUnverifiedAccountAfterLink } = await import(
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
const account = (providerId: string) =>
  ({ id: "acc-new", userId: USER_ID, providerId, accountId: "sub" }) as never

beforeEach(() => {
  vi.clearAllMocks()
  internalAdapter.findUserById.mockResolvedValue({
    id: USER_ID,
    emailVerified: false,
  })
  internalAdapter.findAccounts.mockResolvedValue([
    { id: "acc-pwd", providerId: "credential" },
    { id: "acc-fb", providerId: "facebook" },
    { id: "acc-new", providerId: "google" },
  ])
  internalAdapter.listSessions.mockResolvedValue([
    { token: "s1" },
    { token: "s2" },
  ])
})

describe("claimUnverifiedAccountAfterLink", () => {
  test("verified Google link into an unverified user drops every other login method and its sessions", async () => {
    await claimUnverifiedAccountAfterLink(account("google"), context)

    expect(internalAdapter.deleteAccount).toHaveBeenCalledTimes(2)
    expect(internalAdapter.deleteAccount).toHaveBeenCalledWith("acc-pwd")
    expect(internalAdapter.deleteAccount).toHaveBeenCalledWith("acc-fb")
    expect(internalAdapter.deleteSessions).toHaveBeenCalledWith(["s1", "s2"])
  })

  test("Facebook into an unverified user is refused", async () => {
    await expect(
      claimUnverifiedAccountAfterLink(account("facebook"), context),
    ).rejects.toThrow(EMAIL_ATTESTING_ERROR)
    expect(internalAdapter.deleteAccount).not.toHaveBeenCalled()
    expect(internalAdapter.deleteSessions).not.toHaveBeenCalled()
  })

  test("never deletes the social account that was just created", async () => {
    await claimUnverifiedAccountAfterLink(account("google"), context)
    expect(internalAdapter.deleteAccount).not.toHaveBeenCalledWith("acc-new")
  })

  test("is a no-op for an already verified user", async () => {
    internalAdapter.findUserById.mockResolvedValue({
      id: USER_ID,
      emailVerified: true,
    })
    await claimUnverifiedAccountAfterLink(account("google"), context)
    expect(internalAdapter.findAccounts).not.toHaveBeenCalled()
    expect(internalAdapter.deleteSessions).not.toHaveBeenCalled()
  })

  test("is a no-op when the created account is the credential provider itself", async () => {
    await claimUnverifiedAccountAfterLink(account("credential"), context)
    expect(internalAdapter.findUserById).not.toHaveBeenCalled()
  })

  test("is a no-op without an endpoint context", async () => {
    await claimUnverifiedAccountAfterLink(account("google"), null)
    expect(internalAdapter.findUserById).not.toHaveBeenCalled()
  })

  test("skips the session call when there are no sessions", async () => {
    internalAdapter.listSessions.mockResolvedValue([])
    await claimUnverifiedAccountAfterLink(account("google"), context)
    expect(internalAdapter.deleteSessions).not.toHaveBeenCalled()
  })

  test("fails closed: a cleanup failure propagates so the link is refused", async () => {
    internalAdapter.deleteAccount.mockRejectedValueOnce(new Error("db down"))
    await expect(
      claimUnverifiedAccountAfterLink(account("google"), context),
    ).rejects.toThrow("db down")
  })
})
