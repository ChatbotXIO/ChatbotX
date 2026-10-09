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
 * `createOAuthUser` inserts the user and its first account in the same request,
 * so a user created more than a minute ago with no accounts is a placeholder
 * (for example one whose accounts a concurrent claim just deleted), not a
 * sign-up.
 */
const FRESH_SIGN_UP_WINDOW_MS = 60_000

/** Fails closed: a missing or unparseable `createdAt` is never fresh. */
const isFreshSignUp = (createdAt: unknown): boolean => {
  if (!(typeof createdAt === "string" || createdAt instanceof Date)) {
    return false
  }
  const created = new Date(createdAt).getTime()
  return (
    Number.isFinite(created) && Date.now() - created <= FRESH_SIGN_UP_WINDOW_MS
  )
}

/**
 * Reads the `email_verified` claim from an id token (a JWT string). on the
 * redirect/code flow better-auth received the id_token straight from the
 * provider's token endpoint over TLS (and only decodes it); on the
 * client-supplied id-token sign-in path it verifies the signature. Either way
 * the hook reads the same token better-auth used for the user's profile. This
 * only reads a claim, so it decodes the payload locally. Anything other than an
 * exact `email_verified === true` (missing or malformed token, missing or
 * false claim) is treated as not attested.
 */
const isEmailAttestedByIdToken = (idToken: unknown): boolean => {
  if (typeof idToken !== "string") {
    return false
  }
  try {
    const segment = idToken.split(".")[1]
    if (!segment) {
      return false
    }
    const payload: unknown = JSON.parse(
      Buffer.from(segment, "base64url").toString("utf8"),
    )
    return (
      typeof payload === "object" &&
      payload !== null &&
      (payload as { email_verified?: unknown }).email_verified === true
    )
  } catch {
    return false
  }
}

type EmailAttestation = (account: { idToken?: unknown }) => boolean

/**
 * How each provider proves the person owns the mailbox. A provider missing
 * here cannot claim an unverified placeholder.
 * - google: the id_token carries `email_verified`; only `true` counts.
 * - facebook: the Graph API only returns an email the Facebook account has
 *   confirmed, so its presence in the profile is the attestation (better-auth
 *   exposes no flag for it and marks the user unverified).
 */
const EMAIL_ATTESTATION_BY_PROVIDER: Record<string, EmailAttestation> = {
  google: (account) => isEmailAttestedByIdToken(account.idToken),
  facebook: () => true,
}

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
 * a provider with an entry in `EMAIL_ATTESTATION_BY_PROVIDER` whose attestation
 * passes may claim it: Google through the id token's `email_verified: true`
 * (the hook only reads the claim), Facebook because the Graph API only returns
 * an email the Facebook account has confirmed. The attesting sign-in is the first
 * proof of ownership, so every earlier login method (password or social) and
 * every session on that placeholder is untrusted and removed before the link —
 * otherwise a pre-registered login would keep working once the real owner's
 * sign-in marks the user verified.
 *
 * A user with no accounts that was created within `FRESH_SIGN_UP_WINDOW_MS` is a
 * brand-new OAuth sign-up and is left alone. An older user with no accounts is a
 * placeholder (possibly mid-claim by a concurrent request) and goes through the
 * normal checks: a provider without an attestation strategy is refused, an
 * attesting one still revokes sessions.
 *
 * Fails closed: no endpoint context, a missing user, a provider without an
 * attestation strategy, a failed attestation or a cleanup failure all throw and the
 * link is refused.
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
  if (others.length === 0 && isFreshSignUp(user.createdAt)) {
    return
  }
  const attest = Object.hasOwn(
    EMAIL_ATTESTATION_BY_PROVIDER,
    account.providerId,
  )
    ? EMAIL_ATTESTATION_BY_PROVIDER[account.providerId]
    : undefined
  if (!attest) {
    throw new Error(
      "Only an email-attesting provider can claim an unverified account",
    )
  }
  if (!attest(account as { idToken?: unknown })) {
    throw new Error("The provider did not attest the email address")
  }

  for (const row of others) {
    await internalAdapter.deleteAccount(row.id)
  }

  // This repo configures no `secondaryStorage`, so database rows are the only
  // session store. `internalAdapter.listSessions` is capped by the core
  // adapter's default findMany limit, so delete by userId on the raw adapter.
  const revokedSessions = await context.context.adapter.deleteMany({
    model: "session",
    where: [{ field: "userId", value: userId }],
  })

  logger.info(
    {
      userId,
      providerId: account.providerId,
      removedAccounts: others.length,
      revokedSessions,
    },
    "Unverified placeholder account claimed by a trusted social sign-in",
  )
}
