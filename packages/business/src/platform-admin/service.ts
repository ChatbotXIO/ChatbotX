import { ROOT_TENANT_ID } from "@chatbotx.io/database/partials"
import {
  type PlatformAdminWithUser,
  platformAdminRepository,
} from "@chatbotx.io/database/repositories"
import {
  DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT,
  sendAccountCredentials,
} from "@chatbotx.io/mail"
import { isPlaceholderEmail } from "@chatbotx.io/utils/placeholder-email"
import { generateRandomString, hashPassword } from "better-auth/crypto"
import { ChatbotXException } from "../errors"
import { keys } from "../keys"
import { logger } from "../logger"
import { resolvePlatformSettings } from "../platform/settings"
import { userQuotaService } from "../user-quota/service"

const TEMP_PASSWORD_LENGTH = 16

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
    const { PLATFORM_ADMIN_EMAIL } = keys()
    if (!PLATFORM_ADMIN_EMAIL) {
      return false
    }

    if (user) {
      if (
        user.email !== PLATFORM_ADMIN_EMAIL ||
        (user.tenantId ?? ROOT_TENANT_ID) !== ROOT_TENANT_ID
      ) {
        return false
      }

      return await platformAdminRepository.bootstrapRootAdmin({
        email: PLATFORM_ADMIN_EMAIL,
      })
    }

    return await platformAdminRepository.bootstrapRootAdmin({
      email: PLATFORM_ADMIN_EMAIL,
    })
  }

  async list(input: {
    page?: number | null
    perPage?: number | null
  }): Promise<PlatformAdminList> {
    return await platformAdminRepository.listWithUser(input)
  }

  private async provisionRootUser(email: string): Promise<string> {
    if (isPlaceholderEmail(email)) {
      throw new ChatbotXException(
        "Email address is reserved and cannot be provisioned",
        "invalidEmail",
        400,
      )
    }

    const initialPassword = generateRandomString(
      TEMP_PASSWORD_LENGTH,
      "a-z",
      "A-Z",
      "0-9",
    )
    const hashedPassword = await hashPassword(initialPassword)
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

    const { userId } =
      await platformAdminRepository.insertRootUserWithCredential({
        email,
        hashedPassword,
      })
    await userQuotaService.ensureBootstrapPlan({
      userId,
      tenantId: ROOT_TENANT_ID,
    })

    return userId
  }

  async add(props: { actorId: string; email: string }) {
    const existing = await platformAdminRepository.findRootUserByEmail(
      props.email,
    )
    const userId = existing?.id ?? (await this.provisionRootUser(props.email))

    const admin = await platformAdminRepository.insertIgnore({ userId })
    if (!admin) {
      throw new Error(`Platform admin ${userId} was deleted during assignment`)
    }

    logger.info(
      { actorId: props.actorId, userId, provisioned: !existing },
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
