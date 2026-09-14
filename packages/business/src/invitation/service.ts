import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import { invitationModel } from "@chatbotx.io/database/schema"
import type { InvitationModel } from "@chatbotx.io/database/types"
import { createId, SymbolicSnowflakeIDs } from "@chatbotx.io/utils"
import { addDays } from "date-fns"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { workspaceService } from "../workspace/service"
import { normalizeWorkspaceMemberPermissions } from "../workspace-member/permissions"

class InvitationService extends BaseService {
  async create(props: {
    workspaceId: string
    permissions: WorkspaceMemberPermissions
    invitedBy: string
    tx?: DatabaseClient
  }): Promise<InvitationModel> {
    const { tx = db, workspaceId, invitedBy } = props
    const permissions = normalizeWorkspaceMemberPermissions(props.permissions)
    // Team-member usage is reconcile-counted after acceptance, so prevent
    // issuing invitations once the workspace owner is at their limit.
    const workspace = await workspaceService.findById({ id: workspaceId, tx })
    const atLimit = await quotaEnforcementService.hasReachedLimit({
      userId: workspace.ownerId,
      metric: "teamMembers",
    })
    if (atLimit) {
      throw new ChatbotXException(
        "Team member limit reached for this workspace plan",
      )
    }

    const [invitation] = await tx
      .insert(invitationModel)
      .values({
        id: createId(),
        code: SymbolicSnowflakeIDs.generate(),
        permissions,
        expiresAt: addDays(new Date(), 1),
        workspaceId,
        invitedBy,
      })
      .returning()

    if (!props.tx) {
      try {
        await this.audit(
          "invite",
          `invited a new ${permissions.superAdmin ? "admin" : "member"}`,
        )
      } catch (err) {
        logger.warn(
          { err, workspaceId, invitationId: invitation.id },
          "Failed to record audit log for workspace invitation",
        )
      }
    }

    return invitation
  }

  async findByCodeOrFail(code: string): Promise<InvitationModel> {
    const invitation = await db.query.invitationModel.findFirst({
      where: { code },
    })
    if (!invitation) {
      throw notFoundException("Invitation not found")
    }
    return invitation
  }
}

export const invitationService = new InvitationService()
