import { ROOT_TENANT_ID } from "@chatbotx.io/database/partials"
import {
  type PlatformAdminWithUser,
  platformAdminRepository,
  userRepository,
} from "@chatbotx.io/database/repositories"
import {
  DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT,
  sendAccountCredentials,
} from "@chatbotx.io/mail"
import { isPlaceholderEmail } from "@chatbotx.io/utils/placeholder-email"
import { ChatbotXException } from "../errors"
import { keys } from "../keys"
import { logger } from "../logger"
import { resolvePlatformSettings } from "../platform/settings"
import { generateTemporaryPassword } from "../user/temporary-password"
import { userQuotaService } from "../user-quota/service"

export type PlatformAdminList = {
  data: PlatformAdminWithUser[]
  pageCount: number
}
class PlatformAdminService {
  async isAdmin(userId: string): Promise<boolean> {
    return await platformAdminRepository.existsByUserId(userId)
  }
  async provisionBootstrapAdmin(user?: {
    email: string
    tenantId?: string
  }): Promise<boolean> {
    const email = keys().PLATFORM_ADMIN_EMAIL?.trim().toLowerCase()
    if (
      !email ||
      (user &&
        (user.email.trim().toLowerCase() !== email ||
          (user.tenantId ?? ROOT_TENANT_ID) !== ROOT_TENANT_ID))
    ) {
      return false
    }

    return await platformAdminRepository.bootstrapRootAdmin({ email })
  }

  async list(input: {
    page?: number | null
    perPage?: number | null
  }): Promise<PlatformAdminList> {
    return await platformAdminRepository.listWithUser(input)
  }

  private async provisionRootUser(
    email: string,
  ): Promise<{ userId: string; created: boolean }> {
    if (isPlaceholderEmail(email)) {
      throw new ChatbotXException(
        "Email address is reserved and cannot be provisioned",
        "invalidEmail",
        400,
      )
    }

    const { initialPassword, hashedPassword } =
      await generateTemporaryPassword()
    const settings = await resolvePlatformSettings()
    const signInUrl = new URL("/auth/sign-in", settings.appUrl).toString()

    await sendAccountCredentials(email, {
      brandName: settings.name,
      brandLogoUrl: settings.logoLightUrl,
      brandUrl: settings.appUrl,
      subject: DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT,
      customTemplate: settings.accountCredentialsEmailTemplate,
      userName: email,
      loginEmail: email,
      initialPassword,
      signInUrl,
    })

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

  async add(props: { actorId: string; email: string }) {
    const email = props.email.trim().toLowerCase()
    const existing = await userRepository.findIdByEmail({
      email,
      tenantId: ROOT_TENANT_ID,
    })
    const provisioned = existing
      ? { userId: existing.id, created: false }
      : await this.provisionRootUser(email)

    const admin = await platformAdminRepository.insertIgnore({
      userId: provisioned.userId,
    })
    if (!admin) {
      throw new ChatbotXException(
        `Platform admin ${provisioned.userId} was deleted during assignment`,
        "platformAdminAssignmentConflict",
        409,
      )
    }

    logger.info(
      {
        actorId: props.actorId,
        userId: provisioned.userId,
        provisioned: provisioned.created,
      },
      "added platform admin",
    )
    return admin
  }

  async remove(props: { actorId: string; userId: string }): Promise<void> {
    if (props.actorId === props.userId) {
      throw new ChatbotXException(
        "You cannot remove yourself as a platform admin",
        "cannotRemoveSelf",
        400,
      )
    }

    await platformAdminRepository.deleteByUserId(props.userId)
    logger.info(
      { actorId: props.actorId, userId: props.userId },
      "removed platform admin",
    )
  }
}

export const platformAdminService = new PlatformAdminService()
