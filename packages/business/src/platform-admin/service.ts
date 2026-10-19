import { ROOT_TENANT_ID } from "@chatbotx.io/database/partials"
import {
  type PlatformAdminWithUser,
  platformAdminRepository,
} from "@chatbotx.io/database/repositories"
import { ChatbotXException } from "../errors"
import { keys } from "../keys"
import { logger } from "../logger"

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

  async add(props: { actorId: string; email: string }) {
    const user = await platformAdminRepository.findRootUserByEmail(props.email)
    if (!user) {
      throw new ChatbotXException("User not found", "userNotFound", 404)
    }

    const admin = await platformAdminRepository.insertIgnore({
      userId: user.id,
    })
    if (!admin) {
      throw new Error(`Platform admin ${user.id} was deleted during assignment`)
    }

    logger.info(
      { actorId: props.actorId, userId: user.id },
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
