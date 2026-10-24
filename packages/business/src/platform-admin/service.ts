import {
  isBuilderAdminRole,
  type PlatformAdminRole,
  ROOT_TENANT_ID,
} from "@chatbotx.io/database/partials"
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
    const admin = await platformAdminRepository.findForAuth(userId)
    return isBuilderAdminRole(admin?.role)
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

  async add(props: {
    actorId: string
    email: string
    role: PlatformAdminRole
  }) {
    await this.assertCanManageAdmins(props.actorId)
    const email = props.email.trim().toLowerCase()
    const provisioned = await findOrProvisionRootUser(email)
    if (props.actorId === provisioned.userId && props.role !== "super-admin") {
      throw new ChatbotXException(
        "You cannot lower your own platform administrator role",
        "cannotRemoveSelf",
        400,
      )
    }
    const admin = await platformAdminRepository.upsertRole({
      role: props.role,
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
    await this.assertCanManageAdmins(props.actorId)
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

  private async assertCanManageAdmins(actorId: string): Promise<void> {
    const actor = await platformAdminRepository.findForAuth(actorId)
    if (actor?.role !== "super-admin") {
      throw new ChatbotXException(
        "Only super-admins can manage platform administrators",
        "forbidden",
        403,
      )
    }
  }
}

export const platformAdminService = new PlatformAdminService()
