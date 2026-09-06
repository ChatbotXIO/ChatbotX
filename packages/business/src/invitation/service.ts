import { db } from "@chatbotx.io/database/client"
import type { InvitationModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"

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
}

export const invitationService = new InvitationService()
