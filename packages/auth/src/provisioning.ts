import {
  generateTemporaryPassword,
  platformCredentialService,
  resolveTenantSettingsByOwner,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { userRepository } from "@chatbotx.io/database/repositories"
import {
  DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT,
  sendAccountCredentials,
} from "@chatbotx.io/mail"
import { isPlaceholderEmail } from "@chatbotx.io/utils/placeholder-email"

export type ProvisionResellerAccountInput = {
  /** The reseller (white-label owner) provisioning the account. */
  resellerUserId: string
  /** End-customer's login email. Unique per tenant, not globally. */
  email: string
  /** End-customer's display name. */
  name: string
  /** Live vs test credential selector; defaults to test. */
  livemode?: boolean
  /** Override the sign-in link; defaults to the reseller's branded app URL. */
  signInUrl?: string
}

export type ProvisionResellerAccountResult = {
  userId: string
  /** True when a matching user already existed — no row created, no email sent. */
  alreadyExisted: boolean
}

/**
 * Provision an end-customer sub-account for a reseller: create a tenant-scoped
 * `User` + credential `Account` with a generated temporary password, force a
 * password change on first sign-in, and email the credentials over the
 * reseller's own SMTP so the message stays in their domain.
 *
 * Hard-fails before creating anything if the reseller has no SMTP credential of
 * their own (no platform fallback) — the branded-email guarantee is the whole
 * point of the feature. Idempotent on `(email, tenantId)`.
 */
export async function provisionResellerAccount(
  input: ProvisionResellerAccountInput,
): Promise<ProvisionResellerAccountResult> {
  const { resellerUserId, email, name } = input
  const livemode = input.livemode ?? false

  // The Facebook placeholder domain belongs to phone-only Facebook users; a
  // verified row on it would capture that person's Facebook sign-in while the
  // reseller's temporary password keeps working.
  if (isPlaceholderEmail(email)) {
    throw new ChatbotXException(
      "Email address is reserved and cannot be provisioned",
      "invalidEmail",
      400,
    )
  }

  // 1. Resolve the reseller's OWN SMTP credential first. `findDecryptedForUser`
  //    (not `resolveForOwner`) deliberately skips the platform fallback so a
  //    missing reseller credential hard-fails instead of leaking the platform
  //    sender.
  const smtp = await platformCredentialService.findDecryptedForUser({
    userId: resellerUserId,
    type: "smtp",
    livemode,
  })
  if (!smtp) {
    throw new ChatbotXException(
      "Reseller has no SMTP credential configured; cannot send account credentials",
      "smtpCredentialMissing",
      400,
    )
  }

  // 2. Derive the tenant the sub-account belongs to (owner-derived, never from
  //    request input — see docs/tenancy.md).
  const tenantId = await workspaceService.resolveTenantForOwner(resellerUserId)

  // 3. Idempotency: email is unique per tenant. If the account already exists,
  //    do not recreate it or re-send (the temp password is only known at
  //    creation time).
  const existing = await userRepository.findIdByEmail({ email, tenantId })
  if (existing) {
    return { userId: existing.id, alreadyExisted: true }
  }

  // 4. Generate + hash a temporary password using better-auth's own hasher so
  //    the credential verifies on first sign-in.
  const { initialPassword, hashedPassword } = await generateTemporaryPassword()

  // 5. Resolve branding + sign-in link for the credentials email.
  const settings = await resolveTenantSettingsByOwner(resellerUserId)

  const signInUrl =
    input.signInUrl ?? new URL("/auth/sign-in", settings.appUrl).toString()

  // 6. Email the credentials BEFORE creating the account. Sending over a
  //    reseller-controlled SMTP host is the failure-prone step (bad host, auth
  //    rejected, recipient refused); if it throws here nothing has been written,
  //    so a retry cleanly re-provisions with a fresh password. The reverse order
  //    would commit the account and then lose the only copy of the temporary
  //    password on an SMTP error, orphaning the customer with no way back in.
  await sendAccountCredentials(
    email,
    {
      brandName: settings.name,
      brandLogoUrl: settings.logoLightUrl,
      brandUrl: settings.appUrl,
      subject: DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT,
      customTemplate: settings.accountCredentialsEmailTemplate,
      userName: name,
      loginEmail: email,
      initialPassword,
      signInUrl,
    },
    {
      host: smtp.config.host,
      port: smtp.config.port,
      username: smtp.config.username,
      password: smtp.config.password,
      fromEmail: smtp.config.fromEmail,
      fromName: smtp.config.fromName,
    },
  )

  // 7. Create the user + credential account in one transaction. The repository
  //    resolves a concurrent create of the same tenant-scoped email as an
  //    idempotent result.
  const createdUser = await userRepository.insertWithCredential({
    email,
    name,
    hashedPassword,
    tenantId,
  })

  return {
    userId: createdUser.userId,
    alreadyExisted: !createdUser.created,
  }
}
