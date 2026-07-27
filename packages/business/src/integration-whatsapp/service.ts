import { and, db, eq } from "@chatbotx.io/database/client"
import type { WhatsappRegistrationStatus } from "@chatbotx.io/database/partials"
import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import {
  type IntegrationWhatsappRegistrationError,
  integrationWhatsappModel,
} from "@chatbotx.io/database/schema"
import type { WhatsappSignupSessionModel } from "@chatbotx.io/database/types"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import type { ChannelError } from "@chatbotx.io/sdk"
import { BaseService } from "../base.service"

export type RegistrationStatus = WhatsappRegistrationStatus

export type RegistrationOutcome =
  | { status: "registered" }
  | { status: "pending_verification"; error?: ChannelError }
  | { status: "failed"; error: ChannelError }

type RecordRegistrationOutcomeInput = {
  id: string
  workspaceId: string
  outcome: RegistrationOutcome
}

type CreateSignupSessionInput = {
  userId: string
  ownerId: string
  workspaceId?: string | null
  wabaId: string
  businessId: string
  accessToken: string
  apiVersion: string
  candidatePhoneNumberIds: string[]
}

type ConsumeSignupSessionInput = {
  id: string
  userId: string
  ownerId: string
  phoneNumberId: string
}

type ConsumedSignupSession = WhatsappSignupSessionModel & {
  accessToken: string
}

const serializeRegistrationError = (
  error: ChannelError,
): IntegrationWhatsappRegistrationError => ({
  code: error.code,
  subCode: error.subCode ?? null,
  message: error.message,
  ...(error.type === undefined ? {} : { type: error.type }),
  at: new Date().toISOString(),
})

const buildRegistrationUpdate = (outcome: RegistrationOutcome) => {
  switch (outcome.status) {
    case "registered":
      return {
        registrationStatus: "registered" as const,
        registrationError: null,
      }
    case "pending_verification":
      return {
        registrationStatus: "pending_verification" as const,
        registrationError:
          outcome.error === undefined
            ? null
            : serializeRegistrationError(outcome.error),
      }
    case "failed":
      return {
        registrationStatus: "failed" as const,
        registrationError: serializeRegistrationError(outcome.error),
      }
    default: {
      const _exhaustive: never = outcome
      return _exhaustive
    }
  }
}

class IntegrationWhatsappService extends BaseService {
  findConnectedPhoneNumberIds(phoneNumberIds: string[]): Promise<Set<string>> {
    return integrationWhatsappRepository.findConnectedPhoneNumberIds(
      phoneNumberIds,
    )
  }

  async createSignupSession(
    input: CreateSignupSessionInput,
  ): Promise<WhatsappSignupSessionModel> {
    if (input.candidatePhoneNumberIds.length === 0) {
      throw new Error(
        "Cannot create a WhatsApp signup session without candidates",
      )
    }

    const encryptedAccessToken = await encryptUtils.encryptText(
      input.accessToken,
    )

    return integrationWhatsappRepository.createSignupSession({
      userId: input.userId,
      ownerId: input.ownerId,
      workspaceId: input.workspaceId,
      wabaId: input.wabaId,
      businessId: input.businessId,
      encryptedAccessToken,
      apiVersion: input.apiVersion,
      candidatePhoneNumberIds: input.candidatePhoneNumberIds,
    })
  }

  async consumeSignupSession(
    input: ConsumeSignupSessionInput,
  ): Promise<ConsumedSignupSession | null> {
    const session =
      await integrationWhatsappRepository.consumeSignupSession(input)
    if (!session) {
      return null
    }

    const accessToken = await encryptUtils.decryptText(
      encryptedDataSchema.parse(session.encryptedAccessToken),
    )

    return { ...session, accessToken }
  }

  async recordRegistrationOutcome(
    input: RecordRegistrationOutcomeInput,
  ): Promise<void> {
    await db
      .update(integrationWhatsappModel)
      .set(buildRegistrationUpdate(input.outcome))
      .where(
        and(
          eq(integrationWhatsappModel.id, input.id),
          eq(integrationWhatsappModel.workspaceId, input.workspaceId),
        ),
      )
  }
}

export const integrationWhatsappService = new IntegrationWhatsappService()
