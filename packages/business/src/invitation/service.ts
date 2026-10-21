import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db } from "@chatbotx.io/database/client"
import { invitationRepository } from "@chatbotx.io/database/repositories"
import { invitationModel } from "@chatbotx.io/database/schema"
import type { InvitationModel } from "@chatbotx.io/database/types"
import { createId, SymbolicSnowflakeIDs } from "@chatbotx.io/utils"
import { addDays } from "date-fns"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { userService } from "../user/service"
import { workspaceService } from "../workspace/service"

/** How long a shareable invite code stays usable. */
const INVITATION_TTL_DAYS = 1

class InvitationService extends BaseService {
  private isActive(
    invitation: InvitationModel,
  ): invitation is InvitationModel & { workspaceId: string } {
    return Boolean(invitation.workspaceId && invitation.expiresAt >= new Date())
  }

  async findByCodeOrFail(code: string): Promise<InvitationModel> {
    const invitation = await invitationRepository.findByCode(code)
    if (!invitation) {
      throw notFoundException("Invitation not found")
    }
    return invitation
  }

  /** The invitation behind a code, or `null` when unknown, expired, or workspace-less. */
  async findActiveByCode(
    code: string,
    { tenantId }: { tenantId?: string } = {},
  ): Promise<(InvitationModel & { workspaceId: string }) | null> {
    const invitation = await invitationRepository.findByCode(code)
    if (!(invitation && this.isActive(invitation))) {
      return null
    }
    if (!tenantId) {
      return invitation
    }

    const workspace = await workspaceService.find({
      where: { id: invitation.workspaceId },
    })
    return workspace?.tenantId === tenantId ? invitation : null
  }

  async findActiveByCodeOrFail(
    code: string,
  ): Promise<InvitationModel & { workspaceId: string }> {
    const invitation = await this.findByCodeOrFail(code)
    if (this.isActive(invitation)) {
      return invitation
    }
    if (invitation.expiresAt < new Date()) {
      throw new ChatbotXException("Invitation expired")
    }
    throw new ChatbotXException("Invalid invitation: no workspace associated")
  }

  async getInvitationDetails(code: string) {
    const invitation = await this.findByCodeOrFail(code)
    if (invitation.expiresAt < new Date()) {
      throw new ChatbotXException("Invitation expired")
    }

    const [user, workspace] = await Promise.all([
      userService.findByIdOrFail(invitation.invitedBy),
      invitation.workspaceId
        ? workspaceService.find({ where: { id: invitation.workspaceId } })
        : null,
    ])

    return {
      invitation,
      user,
      workspace: workspace ?? null,
    }
  }

  /** Issues a new shareable invite code for the workspace. */
  async create(props: {
    workspaceId: string
    invitedBy: string
    permissions: InvitationModel["permissions"]
    tx?: DatabaseClient
  }): Promise<InvitationModel> {
    const { workspaceId, invitedBy, permissions, tx = db } = props
    const [invitation] = await tx
      .insert(invitationModel)
      .values({
        id: createId(),
        code: SymbolicSnowflakeIDs.generate(),
        permissions,
        expiresAt: addDays(new Date(), INVITATION_TTL_DAYS),
        workspaceId,
        invitedBy,
      })
      .returning()
    return invitation
  }
}

export const invitationService = new InvitationService()
