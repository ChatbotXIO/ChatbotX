import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { invitationModel } from "@chatbotx.io/database/schema"
import type { InvitationModel } from "@chatbotx.io/database/types"
import { createId, SymbolicSnowflakeIDs } from "@chatbotx.io/utils"
import { addDays } from "date-fns"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"

/** How long a shareable invite code stays usable. */
const INVITATION_TTL_DAYS = 1

class InvitationService extends BaseService {
  async findByCodeOrFail(code: string): Promise<InvitationModel> {
    const invitation = await db.query.invitationModel.findFirst({
      where: { code },
    })
    if (!invitation) {
      throw notFoundException("Invitation not found")
    }
    return invitation
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
