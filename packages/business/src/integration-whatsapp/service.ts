import { and, db, eq, isNull, lt, or } from "@chatbotx.io/database/client"
import type { WhatsappRegistrationStatus } from "@chatbotx.io/database/partials"
import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import {
  type IntegrationWhatsappRegistrationError,
  integrationWhatsappModel,
} from "@chatbotx.io/database/schema"
import type {
  IntegrationWhatsappModel,
  WhatsappSignupSessionModel,
} from "@chatbotx.io/database/types"
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

type FindWorkspaceIntegrationInput = {
  id: string
  workspaceId: string
}

type ClaimVerificationCodeSlotInput = FindWorkspaceIntegrationInput & {
  cooldownSeconds: number
  now?: Date
}

type VerificationCodeSlotClaim =
  | { status: "claimed"; requestedAt: Date }
  | {
      status: "cooldown"
      requestedAt: Date | null
      remainingSeconds: number
    }
  | { status: "not_found" }

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
): IntegrationWhatsappRegistrationError => {
  const originError = readRegistrationErrorOrigin(error.getOriginError())

  return {
    code: error.code,
    subCode: error.subCode ?? null,
    message: error.message,
    ...(error.type === undefined ? {} : { type: error.type }),
    ...(originError.userTitle === undefined
      ? {}
      : { userTitle: originError.userTitle }),
    ...(originError.userMessage === undefined
      ? {}
      : { userMessage: originError.userMessage }),
    ...(originError.fbtraceId === undefined
      ? {}
      : { fbtraceId: originError.fbtraceId }),
    at: new Date().toISOString(),
  }
}

type RegistrationErrorOrigin = {
  userTitle?: string
  userMessage?: string
  fbtraceId?: string
}

function readRegistrationErrorOrigin(originError: unknown) {
  if (typeof originError !== "object" || originError === null) {
    return {}
  }

  const source = originError as Record<string, unknown>

  return {
    userTitle:
      typeof source.userTitle === "string" ? source.userTitle : undefined,
    userMessage:
      typeof source.userMessage === "string" ? source.userMessage : undefined,
    fbtraceId:
      typeof source.fbtraceId === "string" ? source.fbtraceId : undefined,
  } satisfies RegistrationErrorOrigin
}

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
  ): Promise<IntegrationWhatsappRegistrationError | null> {
    const [row] = await db
      .update(integrationWhatsappModel)
      .set(buildRegistrationUpdate(input.outcome))
      .where(
        and(
          eq(integrationWhatsappModel.id, input.id),
          eq(integrationWhatsappModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({
        registrationError: integrationWhatsappModel.registrationError,
      })

    return row?.registrationError ?? null
  }

  async findWorkspaceIntegration(
    input: FindWorkspaceIntegrationInput,
  ): Promise<IntegrationWhatsappModel | null> {
    const integration = await db.query.integrationWhatsappModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
      },
    })

    return integration ?? null
  }

  async claimVerificationCodeSlot(
    input: ClaimVerificationCodeSlotInput,
  ): Promise<VerificationCodeSlotClaim> {
    const now = input.now ?? new Date()
    const cooldownMs = input.cooldownSeconds * 1000
    const cutoff = new Date(now.getTime() - cooldownMs)

    const [claimed] = await db
      .update(integrationWhatsappModel)
      .set({ verificationCodeRequestedAt: now })
      .where(
        and(
          eq(integrationWhatsappModel.id, input.id),
          eq(integrationWhatsappModel.workspaceId, input.workspaceId),
          or(
            isNull(integrationWhatsappModel.verificationCodeRequestedAt),
            lt(integrationWhatsappModel.verificationCodeRequestedAt, cutoff),
          ),
        ),
      )
      .returning({
        requestedAt: integrationWhatsappModel.verificationCodeRequestedAt,
      })

    if (claimed?.requestedAt) {
      return { status: "claimed", requestedAt: claimed.requestedAt }
    }

    const existing = await db.query.integrationWhatsappModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
      },
      columns: {
        verificationCodeRequestedAt: true,
      },
    })

    if (!existing) {
      return { status: "not_found" }
    }

    if (!existing.verificationCodeRequestedAt) {
      return {
        status: "cooldown",
        requestedAt: null,
        remainingSeconds: input.cooldownSeconds,
      }
    }

    const nextAllowedAt =
      existing.verificationCodeRequestedAt.getTime() + cooldownMs
    const remainingSeconds = Math.max(
      0,
      Math.ceil((nextAllowedAt - now.getTime()) / 1000),
    )

    return {
      status: "cooldown",
      requestedAt: existing.verificationCodeRequestedAt,
      remainingSeconds,
    }
  }
}

export const integrationWhatsappService = new IntegrationWhatsappService()
