import type { BetterAuthOptions } from "better-auth"
import { logger } from "./logger"

type AccountCreateAfterHook = NonNullable<
  NonNullable<
    NonNullable<
      NonNullable<BetterAuthOptions["databaseHooks"]>["account"]
    >["create"]
  >["after"]
>

const CREDENTIAL_PROVIDER = "credential"

/** Providers whose sign-in proves the person owns the mailbox (Google honours `email_verified`); Facebook never returns that claim, so it cannot claim a placeholder. */
const EMAIL_ATTESTING_PROVIDERS: ReadonlySet<string> = new Set(["google"])

/**
 * Runs after better-auth inserts a social `Account` for an EXISTING user
 * (`oauth2/link-account.mjs` links before it marks the user verified, so an
 * unverified user here is a placeholder that never proved the mailbox).
 *
 * With `requireLocalEmailVerified: false` a trusted provider may link into such
 * a placeholder, but only an email-attesting provider may claim it; any other
 * provider is refused. A placeholder may already carry a social Account from a
 * provider that cannot prove the mailbox, and whoever created it did not prove
 * ownership either. The attesting provider's sign-in is the first proof of
 * ownership, so every earlier login method (password or social) and every
 * session on that placeholder is untrusted and removed before the link
 * completes — otherwise a pre-registered login would keep working once the
 * real owner's sign-in marks the user verified.
 *
 * Fails closed: if the provider cannot attest or cleanup throws, better-auth
 * refuses the link (`unable_to_link_account`).
 */
export const claimUnverifiedAccountAfterLink: AccountCreateAfterHook = async (
  account,
  context,
) => {
  if (!context || account.providerId === CREDENTIAL_PROVIDER) {
    return
  }
  const { internalAdapter } = context.context
  const userId = String(account.userId)
  const user = await internalAdapter.findUserById(userId)
  if (!user || user.emailVerified) {
    return
  }
  if (!EMAIL_ATTESTING_PROVIDERS.has(account.providerId)) {
    throw new Error(
      "Only an email-attesting provider can claim an unverified account",
    )
  }

  const accounts = await internalAdapter.findAccounts(userId)
  const stale = accounts.filter((row) => row.id !== account.id)
  for (const row of stale) {
    await internalAdapter.deleteAccount(row.id)
  }

  const sessions = await internalAdapter.listSessions(userId)
  if (sessions.length > 0) {
    await internalAdapter.deleteSessions(sessions.map((s) => s.token))
  }

  logger.info(
    {
      userId,
      providerId: account.providerId,
      removedAccounts: stale.length,
      revokedSessions: sessions.length,
    },
    "Unverified placeholder account claimed by a trusted social sign-in",
  )
}
