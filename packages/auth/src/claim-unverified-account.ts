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

/**
 * Runs after better-auth inserts a social `Account` for an EXISTING user
 * (`oauth2/link-account.mjs` links before it marks the user verified, so an
 * unverified user here is a placeholder that never proved the mailbox).
 *
 * With `requireLocalEmailVerified: false` a trusted provider may link into such
 * a placeholder. The provider proved mailbox ownership; whoever created the
 * placeholder did not. So the placeholder's password and sessions are removed
 * before the link completes — otherwise a pre-registered password would start
 * working the moment the real owner's sign-in marks the user verified.
 *
 * Fails closed: if cleanup throws, better-auth refuses the link
 * (`unable_to_link_account`) instead of leaving a live placeholder credential.
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

  const accounts = await internalAdapter.findAccounts(userId)
  const credentials = accounts.filter(
    (row) => row.providerId === CREDENTIAL_PROVIDER,
  )
  for (const row of credentials) {
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
      removedCredentials: credentials.length,
      revokedSessions: sessions.length,
    },
    "Unverified placeholder account claimed by a trusted social sign-in",
  )
}
