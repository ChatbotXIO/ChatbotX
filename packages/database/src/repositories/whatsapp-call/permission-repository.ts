import { type DatabaseClient, db } from "../../client"
import type { WhatsappCallPermissionResponse } from "../../partials/whatsapp-call"
import { whatsappCallPermissionModel } from "../../schema"

type WhatsappCallPermissionRow = typeof whatsappCallPermissionModel.$inferSelect

type UpsertPermissionInput = {
  workspaceId: string
  contactInboxId: string
  response: WhatsappCallPermissionResponse
  isPermanent: boolean
  expiresAt: Date | null
  respondedAt: Date
}

class WhatsappCallPermissionRepository {
  async findByContactInboxId(
    contactInboxId: string,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallPermissionRow | undefined> {
    return await tx.query.whatsappCallPermissionModel.findFirst({
      where: { contactInboxId },
    })
  }

  /**
   * Replaces the contact's permission state — Meta's newest response always
   * wins, so a stale row is fully overwritten.
   */
  async upsertForContactInbox(
    input: UpsertPermissionInput,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallPermissionRow | undefined> {
    const { contactInboxId, ...data } = input
    return await tx
      .insert(whatsappCallPermissionModel)
      .values({ contactInboxId, ...data })
      .onConflictDoUpdate({
        target: whatsappCallPermissionModel.contactInboxId,
        set: {
          response: data.response,
          isPermanent: data.isPermanent,
          expiresAt: data.expiresAt,
          respondedAt: data.respondedAt,
        },
      })
      .returning()
      .then((rows) => rows[0])
  }
}

export const whatsappCallPermissionRepository =
  new WhatsappCallPermissionRepository()
