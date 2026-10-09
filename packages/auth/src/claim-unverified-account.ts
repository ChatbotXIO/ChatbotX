import type { BetterAuthOptions } from "better-auth"
import { logger } from "./logger"

type AccountCreateBeforeHook = NonNullable<
  NonNullable<
    NonNullable<
      NonNullable<BetterAuthOptions["databaseHooks"]>["account"]
    >["create"]
  >["before"]
>

const CREDENTIAL_PROVIDER = "credential"

/**
 * Providers whose sign-in proves the person owns the mailbox. `google` is here
 * because Google requires mailbox verification before an account can sign in,
 * and better-auth marks the user verified only when the token's
 * `email_verified` is true. Facebook never returns that claim, so it cannot
 * claim a placeholder.
 */
const EMAIL_ATTESTING_PROVIDERS: ReadonlySet<string> = new Set(["google"])

/**
 * Runs BEFORE better-auth inserts a social `Account` row. It must be a before
 * hook: better-auth defers `account.create.after` hooks until the HTTP handler
 * has returned, by which point `link-account.mjs` has already marked the user
 * verified (so an after hook sees no placeholder) and a throw there would land
 * after the row committed. A before hook runs synchronously inside
 * `createWithHooks`, ahead of the insert, and a throw propagates to
 * `unable_to_link_account`.
 *
 * With `requireLocalEmailVerified: false` a trusted provider may link into an
 * unverified local user (a placeholder that never proved the mailbox), but only
 * an email-attesting provider may claim it. The attesting sign-in is the first
 * proof of ownership, so every earlier login method (password or social) and
 * every session on that placeholder is untrusted and removed before the link —
 * otherwise a pre-registered login would keep working once the real owner's
 * sign-in marks the user verified.
 *
 * A user with no accounts yet is a brand-new OAuth sign-up (`createOAuthUser`
 * inserts the user, then its first account) or a legacy row with nothing to
 * revoke, so it is left alone.
 *
 * Fails closed: no endpoint context, a missing user, a non-attesting provider
 * or a cleanup failure all throw and the link is refused.
 */
export const claimUnverifiedAccountBeforeLink: AccountCreateBeforeHook = async (
  account,
  context,
) => {
  if (account.providerId === CREDENTIAL_PROVIDER) {
    return
  }
  if (!context) {
    throw new Error("Cannot inspect the user without an endpoint context")
  }
  const { internalAdapter } = context.context
  const userId = String(account.userId)
  const user = await internalAdapter.findUserById(userId)
  if (!user) {
    throw new Error("Cannot link an account to an unknown user")
  }
  if (user.emailVerified) {
    return
  }

  const others = await internalAdapter.findAccounts(userId)
  if (others.length === 0) {
    return
  }
  if (!EMAIL_ATTESTING_PROVIDERS.has(account.providerId)) {
    throw new Error(
      "Only an email-attesting provider can claim an unverified account",
    )
  }

  for (const row of others) {
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
      removedAccounts: others.length,
      revokedSessions: sessions.length,
    },
    "Unverified placeholder account claimed by a trusted social sign-in",
  )
}
