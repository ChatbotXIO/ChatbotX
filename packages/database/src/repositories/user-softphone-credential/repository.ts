import type { EncryptedData } from "@chatbotx.io/encryption"
import { and, type DatabaseClient, db, eq, isNull } from "../../client"
import { userSoftphoneCredentialModel } from "../../schema"

type UserSoftphoneCredentialRow =
  typeof userSoftphoneCredentialModel.$inferSelect

type WorkspaceUserRef = { workspaceId: string; userId: string }

type UpsertInput = WorkspaceUserRef & {
  sipUsername: string
  passwordEncrypted: EncryptedData
  expiresAt: Date
}

class UserSoftphoneCredentialRepository {
  /**
   * Mints/rotates the softphone credential for a (workspace, user) pair.
   * `sipUsername` is deterministic (`ag-<workspaceId>-<userId>`, minted by
   * the business layer), so the conflict target is the pair unique index —
   * a rotation always reuses the same row, clearing any prior revocation.
   */
  async upsertForUser(
    input: UpsertInput,
    tx: DatabaseClient = db,
  ): Promise<UserSoftphoneCredentialRow> {
    const [row] = await tx
      .insert(userSoftphoneCredentialModel)
      .values(input)
      .onConflictDoUpdate({
        target: [
          userSoftphoneCredentialModel.workspaceId,
          userSoftphoneCredentialModel.userId,
        ],
        set: {
          sipUsername: input.sipUsername,
          passwordEncrypted: input.passwordEncrypted,
          expiresAt: input.expiresAt,
          revokedAt: null,
        },
      })
      .returning()

    if (!row) {
      throw new Error(
        `UserSoftphoneCredential upsert race lost for workspaceId ${input.workspaceId} userId ${input.userId}`,
      )
    }
    return row
  }

  /**
   * Resolves a live (unrevoked, unexpired) credential by its SIP username —
   * the xml_curl `directory` renderer's lookup for a FreeSWITCH REGISTER.
   */
  async findActiveBySipUsername(
    sipUsername: string,
    now: Date = new Date(),
    tx: DatabaseClient = db,
  ): Promise<UserSoftphoneCredentialRow | undefined> {
    return await tx.query.userSoftphoneCredentialModel.findFirst({
      where: {
        sipUsername,
        revokedAt: { isNull: true },
        expiresAt: { gt: now },
      },
    })
  }

  /** Revokes a member's softphone credential (member removal, inbox access revoked). */
  async revoke(
    input: WorkspaceUserRef,
    now: Date = new Date(),
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(userSoftphoneCredentialModel)
      .set({ revokedAt: now })
      .where(
        and(
          eq(userSoftphoneCredentialModel.workspaceId, input.workspaceId),
          eq(userSoftphoneCredentialModel.userId, input.userId),
          isNull(userSoftphoneCredentialModel.revokedAt),
        ),
      )
  }
}

export const userSoftphoneCredentialRepository =
  new UserSoftphoneCredentialRepository()
