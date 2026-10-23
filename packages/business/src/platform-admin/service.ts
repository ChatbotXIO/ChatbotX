import { ROOT_TENANT_ID } from "@chatbotx.io/database/partials"
import {
  type PlatformAdminWithUser,
  platformAdminRepository,
} from "@chatbotx.io/database/repositories"
import { ChatbotXException } from "../errors"
import { keys } from "../keys"
import { logger } from "../logger"
import { findOrProvisionRootUser } from "../user/provision-root-user"

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

  async add(props: { actorId: string; email: string }) {
    const email = props.email.trim().toLowerCase()
    const provisioned = await findOrProvisionRootUser(email)

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

    await platformAdminRepository.invalidateByUserId(provisioned.userId)

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

    await platformAdminRepository.invalidateByUserId(props.userId)
    logger.info(
      { actorId: props.actorId, userId: props.userId },
      "removed platform admin",
    )
  }
}

export const platformAdminService = new PlatformAdminService()
