import {
  platformCredentialService,
  resolveTenantSettingsByOwner,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, isUniqueViolationError } from "@chatbotx.io/database/client"
import { accountModel, userModel } from "@chatbotx.io/database/schema"
import {
  DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT,
  sendAccountCredentials,
} from "@chatbotx.io/mail"
import { generateRandomString, hashPassword } from "better-auth/crypto"

const TEMP_PASSWORD_LENGTH = 16

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
  const existing = await db.query.userModel.findFirst({
    where: { email, tenantId },
    columns: { id: true },
  })
  if (existing) {
    return { userId: existing.id, alreadyExisted: true }
  }

  // 4. Generate + hash a temporary password using better-auth's own hasher so
  //    the credential verifies on first sign-in.
  const initialPassword = generateRandomString(
    TEMP_PASSWORD_LENGTH,
    "a-z",
    "A-Z",
    "0-9",
  )
  const hashedPassword = await hashPassword(initialPassword)

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

  // 7. Create the user + credential account in one transaction. Business-layer
  //    `db` is NOT tenant-scoped, so `tenantId` is stamped explicitly on both.
  //    A concurrent provision of the same (email, tenantId) can slip between the
  //    idempotency check in step 3 and this insert; the unique index
  //    `User_email_tenant_key` rejects the loser, so translate that into the
  //    idempotent `alreadyExisted` result instead of surfacing a raw 23505.
  try {
    const userId = await db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(userModel)
        .values({
          email,
          name,
          emailVerified: true,
          mustChangePassword: true,
          tenantId,
        })
        .returning({ id: userModel.id })

      if (!createdUser) {
        throw new ChatbotXException(
          "Failed to create provisioned user",
          "provisionFailed",
          500,
        )
      }

      await tx.insert(accountModel).values({
        accountId: createdUser.id,
        providerId: "credential",
        password: hashedPassword,
        userId: createdUser.id,
        tenantId,
      })

      return createdUser.id
    })

    return { userId, alreadyExisted: false }
  } catch (error) {
    if (isUniqueViolationError(error)) {
      const raced = await db.query.userModel.findFirst({
        where: { email, tenantId },
        columns: { id: true },
      })
      if (raced) {
        return { userId: raced.id, alreadyExisted: true }
      }
    }
    throw error
  }
}
