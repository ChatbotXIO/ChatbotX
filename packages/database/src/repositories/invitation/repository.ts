import type { DatabaseClient } from "../../client"
import { db } from "../../client"
import { invitationModel } from "../../schema"
import type { InvitationModel } from "../../types"

type InvitationInsert = typeof invitationModel.$inferInsert

class InvitationRepository {
  async findByCode(
    code: string,
    tx: DatabaseClient = db,
  ): Promise<InvitationModel | undefined> {
    return await tx.query.invitationModel.findFirst({ where: { code } })
  }

  async create(
    values: InvitationInsert,
    tx: DatabaseClient = db,
  ): Promise<InvitationModel> {
    const [invitation] = await tx
      .insert(invitationModel)
      .values(values)
      .returning()
    return invitation
  }
}

export const invitationRepository = new InvitationRepository()
