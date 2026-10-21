import { ROOT_TENANT_ID } from "@chatbotx.io/database/partials"
import { userRepository } from "@chatbotx.io/database/repositories"
import {
  DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT,
  sendAccountCredentials,
} from "@chatbotx.io/mail"
import { isPlaceholderEmail } from "@chatbotx.io/utils/placeholder-email"
import { ChatbotXException } from "../errors"
import { resolvePlatformSettings } from "../platform/settings"
import { resolvePlatformSmtpTransport } from "../platform/smtp"
import { userQuotaService } from "../user-quota/service"
import { generateTemporaryPassword } from "./temporary-password"

/**
 * Finds a root-tenant user by email, or provisions a fresh one with a mailed
 * temporary password — the "add by email" flow `PlatformAdminService.add`
 * originally inlined, now shared with `adminWorkspaceService.createWithMembers`.
 * Root tenant only: a reseller sub-account email must be looked up directly
 * against its own tenant instead (auto-provisioning there would create a
 * second, unrelated root-tenant account for the same address).
 */
export async function findOrProvisionRootUser(
  email: string,
): Promise<{ userId: string; created: boolean }> {
  const existing = await userRepository.findIdByEmail({
    email,
    tenantId: ROOT_TENANT_ID,
  })
  if (existing) {
    return { userId: existing.id, created: false }
  }

  if (isPlaceholderEmail(email)) {
    throw new ChatbotXException(
      "Email address is reserved and cannot be provisioned",
      "invalidEmail",
      400,
    )
  }

  const { initialPassword, hashedPassword } = await generateTemporaryPassword()
  const settings = await resolvePlatformSettings()
  const signInUrl = new URL("/auth/sign-in", settings.appUrl).toString()

  const transport = await resolvePlatformSmtpTransport()
  await sendAccountCredentials(
    email,
    {
      brandName: settings.name,
      brandLogoUrl: settings.logoLightUrl,
      brandUrl: settings.appUrl,
      subject: DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT,
      customTemplate: settings.accountCredentialsEmailTemplate,
      userName: email,
      loginEmail: email,
      initialPassword,
      signInUrl,
    },
    transport,
  )

  const provisioned = await userRepository.insertWithCredential({
    email,
    hashedPassword,
    tenantId: ROOT_TENANT_ID,
  })
  await userQuotaService.ensureBootstrapPlan({
    userId: provisioned.userId,
    tenantId: ROOT_TENANT_ID,
  })

  return provisioned
}
