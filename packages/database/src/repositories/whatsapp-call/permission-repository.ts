import { type DatabaseClient, db, lte } from "../../client"
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
   * Replaces the contact's permission state — Meta's newest response wins.
   * `setWhere` enforces that ordering under concurrency: a job carrying an
   * older reply than the stored row is a no-op (returns no row), so
   * out-of-order processing can never regress the grant.
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
        setWhere: lte(
          whatsappCallPermissionModel.respondedAt,
          data.respondedAt,
        ),
      })
      .returning()
      .then((rows) => rows[0])
  }
}

export const whatsappCallPermissionRepository =
  new WhatsappCallPermissionRepository()
