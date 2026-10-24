import type { DatabaseClient } from "../../client"
import { db } from "../../client"
import type { InvitationModel } from "../../types"

class InvitationRepository {
  async findByCode(
    code: string,
    tx: DatabaseClient = db,
  ): Promise<InvitationModel | undefined> {
    return await tx.query.invitationModel.findFirst({ where: { code } })
  }
}

export const invitationRepository = new InvitationRepository()
