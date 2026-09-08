import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  type UpdateWhatsappBusinessAccountScopeCacheInput,
  whatsappBusinessAccountRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappBusinessAccountModel } from "@chatbotx.io/database/types"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import { z } from "zod"
import { BaseService } from "../base.service"

export const whatsappWabaCredentialSchema = z.object({
  accessToken: z.string().min(1),
  apiVersion: z.string().min(1),
})
export type WhatsappWabaCredential = z.infer<
  typeof whatsappWabaCredentialSchema
>

type WabaRef = {
  workspaceId: string
  wabaId: string
}

type UpsertCredentialInput = WabaRef & {
  businessId: string
  credential: WhatsappWabaCredential
  grantedScopes: string[]
  scopeCheckedAt: Date
  expectedRevision: number
  tx?: DatabaseClient
}

type UpdateScopeCacheInput = Omit<
  UpdateWhatsappBusinessAccountScopeCacheInput,
  "tx"
> & { tx?: DatabaseClient }

const wabaCredentialAad = ({ workspaceId, wabaId }: WabaRef) =>
  `whatsapp-waba:${workspaceId}:${wabaId}`

export class WhatsappBusinessAccountService extends BaseService {
  findByWaba(input: WabaRef & { tx?: DatabaseClient }) {
    return whatsappBusinessAccountRepository.findByWaba(input)
  }

  async findDecryptedCredential(
    input: WabaRef & { tx?: DatabaseClient },
  ): Promise<
    | (WhatsappBusinessAccountModel & {
        decryptedCredential: WhatsappWabaCredential
      })
    | null
  > {
    const row = await this.findByWaba(input)
    if (!row) {
      return null
    }

    const decryptedCredential = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.credential),
      whatsappWabaCredentialSchema,
      wabaCredentialAad(input),
    )
    return { ...row, decryptedCredential }
  }

  async upsertCredential(input: UpsertCredentialInput) {
    const credentialInput = whatsappWabaCredentialSchema.parse(input.credential)
    const credential = await encryptUtils.encryptObject(
      credentialInput,
      wabaCredentialAad(input),
    )
    return await whatsappBusinessAccountRepository.upsertCredential({
      ...input,
      credential,
    })
  }

  async updateScopeCache(input: UpdateScopeCacheInput) {
    return await whatsappBusinessAccountRepository.updateScopeCache(input)
  }
}

export const whatsappBusinessAccountService =
  new WhatsappBusinessAccountService()
