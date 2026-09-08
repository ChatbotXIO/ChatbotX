import type { EncryptedData } from "@chatbotx.io/encryption"
import { and, type DatabaseClient, db, eq, sql } from "../../client"
import { whatsappBusinessAccountModel } from "../../schema"
import type { WhatsappBusinessAccountModel } from "../../types"

type WabaRef = {
  workspaceId: string
  wabaId: string
}

export type UpsertWhatsappBusinessAccountCredentialInput = WabaRef & {
  businessId: string
  credential: EncryptedData
  grantedScopes: string[]
  scopeCheckedAt: Date
  /** The revision read by the caller; zero represents an absent record. */
  expectedRevision: number
  tx?: DatabaseClient
}

export type UpdateWhatsappBusinessAccountScopeCacheInput = WabaRef & {
  grantedScopes: string[]
  scopeCheckedAt: Date
  expectedRevision: number
  tx?: DatabaseClient
}

const wabaFilter = (input: WabaRef) =>
  and(
    eq(whatsappBusinessAccountModel.workspaceId, input.workspaceId),
    eq(whatsappBusinessAccountModel.wabaId, input.wabaId),
  )

export class WhatsappBusinessAccountRepository {
  async findByWaba(
    input: WabaRef & { tx?: DatabaseClient },
  ): Promise<WhatsappBusinessAccountModel | null> {
    const [row] = await (input.tx ?? db)
      .select()
      .from(whatsappBusinessAccountModel)
      .where(wabaFilter(input))
      .limit(1)

    return row ?? null
  }

  /**
   * Inserts a new record for virtual revision zero, or atomically replaces a
   * credential only when the caller still owns the row revision it read.
   */
  async upsertCredential(
    input: UpsertWhatsappBusinessAccountCredentialInput,
  ): Promise<WhatsappBusinessAccountModel | null> {
    const now = new Date()
    const [row] = await (input.tx ?? db)
      .insert(whatsappBusinessAccountModel)
      .values({
        workspaceId: input.workspaceId,
        wabaId: input.wabaId,
        businessId: input.businessId,
        credential: input.credential,
        grantedScopes: input.grantedScopes,
        scopeCheckedAt: input.scopeCheckedAt,
        // An absent row has virtual revision 0, so its first successful write
        // must publish revision 1 to make simultaneous creators conflict.
        revision: 1,
      })
      .onConflictDoUpdate({
        target: [
          whatsappBusinessAccountModel.workspaceId,
          whatsappBusinessAccountModel.wabaId,
        ],
        set: {
          businessId: input.businessId,
          credential: input.credential,
          grantedScopes: input.grantedScopes,
          scopeCheckedAt: input.scopeCheckedAt,
          revision: sql`${whatsappBusinessAccountModel.revision} + 1`,
          updatedAt: now,
        },
        setWhere: eq(
          whatsappBusinessAccountModel.revision,
          input.expectedRevision,
        ),
      })
      .returning()

    return row ?? null
  }

  async updateScopeCache(
    input: UpdateWhatsappBusinessAccountScopeCacheInput,
  ): Promise<WhatsappBusinessAccountModel | null> {
    const [row] = await (input.tx ?? db)
      .update(whatsappBusinessAccountModel)
      .set({
        grantedScopes: input.grantedScopes,
        scopeCheckedAt: input.scopeCheckedAt,
        revision: sql`${whatsappBusinessAccountModel.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          wabaFilter(input),
          eq(whatsappBusinessAccountModel.revision, input.expectedRevision),
        ),
      )
      .returning()

    return row ?? null
  }
}

export const whatsappBusinessAccountRepository =
  new WhatsappBusinessAccountRepository()
