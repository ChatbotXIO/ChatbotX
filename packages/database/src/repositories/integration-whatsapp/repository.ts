import type { EncryptedData } from "@chatbotx.io/encryption"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  inArray,
  isNull,
  sql,
} from "../../client"
import {
  integrationWhatsappModel,
  whatsappSignupSessionModel,
} from "../../schema"
import type { WhatsappSignupSessionModel } from "../../types"

type CreateWhatsappSignupSessionInput = {
  userId: string
  ownerId: string
  workspaceId?: string | null
  wabaId: string
  businessId: string
  encryptedAccessToken: EncryptedData
  apiVersion: string
  candidatePhoneNumberIds: string[]
}

type ConsumeWhatsappSignupSessionInput = {
  id: string
  userId: string
  ownerId: string
  phoneNumberId: string
  now?: Date
  tx?: DatabaseClient
}

class IntegrationWhatsappRepository {
  async findConnectedPhoneNumberIds(
    phoneNumberIds: string[],
    tx: DatabaseClient = db,
  ): Promise<Set<string>> {
    if (phoneNumberIds.length === 0) {
      return new Set()
    }

    const rows = await tx
      .select({ phoneNumberId: integrationWhatsappModel.phoneNumberId })
      .from(integrationWhatsappModel)
      .where(inArray(integrationWhatsappModel.phoneNumberId, phoneNumberIds))

    return new Set(rows.map((row) => row.phoneNumberId))
  }

  async createSignupSession(
    input: CreateWhatsappSignupSessionInput,
    tx: DatabaseClient = db,
  ): Promise<WhatsappSignupSessionModel> {
    const [row] = await tx
      .insert(whatsappSignupSessionModel)
      .values({
        userId: input.userId,
        ownerId: input.ownerId,
        workspaceId: input.workspaceId || null,
        wabaId: input.wabaId,
        businessId: input.businessId,
        encryptedAccessToken: input.encryptedAccessToken,
        apiVersion: input.apiVersion,
        candidatePhoneNumberIds: input.candidatePhoneNumberIds,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })
      .returning()

    if (!row) {
      throw new Error("Failed to create WhatsApp signup session")
    }

    return row
  }

  async consumeSignupSession(
    input: ConsumeWhatsappSignupSessionInput,
  ): Promise<WhatsappSignupSessionModel | null> {
    const { tx = db, now = new Date() } = input
    const [row] = await tx
      .update(whatsappSignupSessionModel)
      .set({ consumedAt: now })
      .where(
        and(
          eq(whatsappSignupSessionModel.id, input.id),
          eq(whatsappSignupSessionModel.userId, input.userId),
          eq(whatsappSignupSessionModel.ownerId, input.ownerId),
          isNull(whatsappSignupSessionModel.consumedAt),
          gt(whatsappSignupSessionModel.expiresAt, now),
          sql`${input.phoneNumberId} = ANY(${whatsappSignupSessionModel.candidatePhoneNumberIds})`,
        ),
      )
      .returning()

    return row ?? null
  }
}

export const integrationWhatsappRepository = new IntegrationWhatsappRepository()
