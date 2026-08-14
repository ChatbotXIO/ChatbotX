import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { WhatsappRegistrationStatus } from "@chatbotx.io/database/partials"
import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import type { IntegrationWhatsappRegistrationError } from "@chatbotx.io/database/schema"
import type {
  IntegrationWhatsappModel,
  WhatsappSignupSessionModel,
} from "@chatbotx.io/database/types"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import type { ChannelError } from "@chatbotx.io/sdk"
import { z } from "zod"
import { BaseService } from "../base.service"
import { logger } from "../logger"

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

type RefreshCapiScopeCacheInput = FindWorkspaceIntegrationInput & {
  now?: Date
  maxAgeMs?: number
  checkScope: (params: {
    accessToken: string
    wabaId: string
  }) => Promise<boolean>
}

type ReplaceAuthInput = FindWorkspaceIntegrationInput & {
  auth: unknown
  hasCapiScope: boolean
  capiScopeCheckedAt?: Date
}

type EnsureDatasetIdInput = FindWorkspaceIntegrationInput & {
  provision: (params: {
    wabaId: string
    accessToken: string
  }) => Promise<string>
}

export const WHATSAPP_CAPI_SCOPE = "whatsapp_business_manage_events"
export const WHATSAPP_CAPI_SCOPE_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export const whatsappAuthForCapiScopeSchema = z.object({
  version: z.string().trim().min(1).optional(),
  tokens: z.object({
    accessToken: z.string().trim().min(1),
  }),
  metadata: z.object({
    wabaId: z.string().trim().min(1),
  }),
})

type ClaimVerificationCodeSlotInput = FindWorkspaceIntegrationInput & {
  cooldownSeconds: number
  now?: Date
}

type ReleaseVerificationCodeSlotInput = FindWorkspaceIntegrationInput & {
  claimedAt: Date
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

type SignupSessionClaimInput = {
  id: string
  userId: string
  ownerId: string
  phoneNumberId: string
  tx?: DatabaseClient
}

type AuthorizedSignupSession = WhatsappSignupSessionModel & {
  accessToken: string
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

  /**
   * Reads a pending phone-number selection without spending it, so the caller
   * can finish its provider calls before committing to the single use.
   */
  async findActiveSignupSession(
    input: SignupSessionClaimInput,
  ): Promise<AuthorizedSignupSession | null> {
    const session =
      await integrationWhatsappRepository.findActiveSignupSession(input)

    return session ? await this.withAccessToken(session) : null
  }

  /**
   * Spends the session. Pass the connect transaction as `input.tx` so the
   * session survives a failed connect and the user can pick again without
   * repeating Meta's signup.
   */
  async consumeSignupSession(
    input: SignupSessionClaimInput,
  ): Promise<AuthorizedSignupSession | null> {
    const session =
      await integrationWhatsappRepository.consumeSignupSession(input)

    return session ? await this.withAccessToken(session) : null
  }

  purgeFinishedSignupSessions(input?: {
    now?: Date
    batchSize?: number
  }): Promise<number> {
    return integrationWhatsappRepository.purgeFinishedSignupSessions(input)
  }

  private async withAccessToken(
    session: WhatsappSignupSessionModel,
  ): Promise<AuthorizedSignupSession> {
    const accessToken = await encryptUtils.decryptText(
      encryptedDataSchema.parse(session.encryptedAccessToken),
    )

    return { ...session, accessToken }
  }

  recordRegistrationOutcome(
    input: RecordRegistrationOutcomeInput,
  ): Promise<IntegrationWhatsappRegistrationError | null> {
    return integrationWhatsappRepository.updateRegistration({
      id: input.id,
      workspaceId: input.workspaceId,
      values: buildRegistrationUpdate(input.outcome),
    })
  }

  listByWorkspaceId(workspaceId: string) {
    return integrationWhatsappRepository.listByWorkspaceId(workspaceId)
  }

  findByIdForWorkspace(
    input: FindWorkspaceIntegrationInput,
  ): Promise<IntegrationWhatsappModel | null> {
    return integrationWhatsappRepository.findByIdForWorkspace(input)
  }

  findWorkspaceIntegration(
    input: FindWorkspaceIntegrationInput,
  ): Promise<IntegrationWhatsappModel | null> {
    return integrationWhatsappRepository.findByIdForWorkspace(input)
  }

  /**
   * Resolves the WhatsApp integration owning an inbox, for the explicit
   * "Send Meta CAPI Event" action (Meta Conversions API). Mirrors the
   * messenger/instagram `findByInboxIdForWorkspace` contract — throws rather
   * than returning null so it composes with `metaConversionsService`'s
   * generic per-channel integration resolver.
   */
  async findByInboxIdForWorkspace(input: {
    inboxId: string
    workspaceId: string
  }): Promise<IntegrationWhatsappModel> {
    const integration =
      await integrationWhatsappRepository.findByInboxIdForWorkspace(input)

    if (!integration) {
      throw new Error("WhatsApp integration not found for workspace")
    }

    return integration
  }

  findAllForTokenRefresh() {
    return integrationWhatsappRepository.findAllForTokenRefresh()
  }

  findForTokenRefreshByWorkspaceIds(workspaceIds: string[]) {
    return integrationWhatsappRepository.findForTokenRefreshByWorkspaceIds(
      workspaceIds,
    )
  }

  /**
   * Replace the stored OAuth credentials after a token refresh. Scoped by
   * workspace so a forged integration id can never touch another tenant's row.
   */
  updateAuth(
    input: FindWorkspaceIntegrationInput & { auth: Record<string, unknown> },
  ): Promise<void> {
    return integrationWhatsappRepository.updateAuth(input)
  }

  markTokenRefreshError(id: string, error: string): Promise<void> {
    return integrationWhatsappRepository.markTokenRefreshError(id, error)
  }

  async refreshCapiScopeCache(
    input: RefreshCapiScopeCacheInput,
  ): Promise<IntegrationWhatsappModel | null> {
    const now = input.now ?? new Date()
    const maxAgeMs = input.maxAgeMs ?? WHATSAPP_CAPI_SCOPE_CACHE_TTL_MS
    const existing = await this.findWorkspaceIntegration(input)
    if (!existing) {
      return null
    }

    if (
      existing.capiScopeCheckedAt &&
      now.getTime() - existing.capiScopeCheckedAt.getTime() < maxAgeMs
    ) {
      return existing
    }

    const expectedCapiScopeCheckedAt = existing.capiScopeCheckedAt ?? null
    const claimed =
      await integrationWhatsappRepository.claimCapiScopeCacheRefresh({
        id: input.id,
        workspaceId: input.workspaceId,
        capiScopeCheckedAt: now,
        expectedCapiScopeCheckedAt,
      })
    if (!claimed) {
      return this.findWorkspaceIntegration(input)
    }

    const auth = whatsappAuthForCapiScopeSchema.parse(existing.auth)
    let hasCapiScope: boolean
    try {
      hasCapiScope = await input.checkScope({
        accessToken: auth.tokens.accessToken,
        wabaId: existing.wabaId,
      })
    } catch (err) {
      logger.warn(
        { err, id: input.id, workspaceId: input.workspaceId },
        "integration-whatsapp: CAPI scope refresh failed",
      )
      // Keep the claim timestamp so a transient Meta failure does not trigger a
      // request-path retry storm; the previous scope value remains authoritative.
      return claimed
    }

    return integrationWhatsappRepository.updateCapiScopeCache({
      id: input.id,
      workspaceId: input.workspaceId,
      hasCapiScope,
      capiScopeCheckedAt: now,
      expectedCapiScopeCheckedAt: now,
    })
  }

  async replaceAuth(
    input: ReplaceAuthInput,
  ): Promise<IntegrationWhatsappModel> {
    const existing = await this.findWorkspaceIntegration(input)
    if (!existing) {
      throw new Error("WhatsApp integration not found")
    }

    const auth = whatsappAuthForCapiScopeSchema.parse(input.auth)
    if (auth.metadata.wabaId !== existing.wabaId) {
      throw new Error(
        "Reconnect returned a different WhatsApp Business Account",
      )
    }

    const updated = await integrationWhatsappRepository.replaceAuth({
      id: input.id,
      workspaceId: input.workspaceId,
      auth: input.auth,
      hasCapiScope: input.hasCapiScope,
      capiScopeCheckedAt: input.capiScopeCheckedAt ?? new Date(),
    })
    if (!updated) {
      throw new Error("WhatsApp integration not found")
    }

    return updated
  }

  async ensureDatasetId(input: EnsureDatasetIdInput): Promise<string> {
    const existing = await this.findWorkspaceIntegration(input)
    if (!existing) {
      throw new Error("WhatsApp integration not found")
    }

    if (existing.datasetId) {
      return existing.datasetId
    }

    const auth = whatsappAuthForCapiScopeSchema.parse(existing.auth)
    const datasetId = await input.provision({
      wabaId: existing.wabaId,
      accessToken: auth.tokens.accessToken,
    })

    const updated = await integrationWhatsappRepository.updateDatasetIdIfNull({
      id: input.id,
      workspaceId: input.workspaceId,
      datasetId,
    })
    if (updated?.datasetId) {
      return updated.datasetId
    }

    const reread = await this.findWorkspaceIntegration(input)
    if (reread?.datasetId) {
      return reread.datasetId
    }

    throw new Error("WhatsApp integration dataset id was not stored")
  }

  /**
   * Takes the right to ask Meta for a verification code, throttled to one
   * request per `cooldownSeconds`.
   *
   * The claim is taken before the provider call so concurrent requests cannot
   * both get through; release it with `releaseVerificationCodeSlot` when the
   * call fails, since no code was sent.
   */
  async claimVerificationCodeSlot(
    input: ClaimVerificationCodeSlotInput,
  ): Promise<VerificationCodeSlotClaim> {
    const now = input.now ?? new Date()
    const cooldownMs = input.cooldownSeconds * 1000

    const requestedAt =
      await integrationWhatsappRepository.claimVerificationCodeSlot({
        id: input.id,
        workspaceId: input.workspaceId,
        now,
        cutoff: new Date(now.getTime() - cooldownMs),
      })

    if (requestedAt) {
      return { status: "claimed", requestedAt }
    }

    const existing =
      await integrationWhatsappRepository.findVerificationCodeRequestedAt(input)

    if (!existing) {
      return { status: "not_found" }
    }

    // A slot released by a failed concurrent request leaves no timestamp
    // behind, so the cooldown is already over and the caller may retry now.
    const nextAllowedAt = existing.verificationCodeRequestedAt
      ? existing.verificationCodeRequestedAt.getTime() + cooldownMs
      : now.getTime()

    return {
      status: "cooldown",
      requestedAt: existing.verificationCodeRequestedAt ?? null,
      remainingSeconds: Math.max(
        0,
        Math.ceil((nextAllowedAt - now.getTime()) / 1000),
      ),
    }
  }

  /**
   * Gives back a slot whose provider call never sent a code, so a transient
   * failure does not lock the operator out for a full cooldown.
   *
   * Only the exact claim is withdrawn — if another request has since taken the
   * slot, that newer claim stands.
   */
  releaseVerificationCodeSlot(
    input: ReleaseVerificationCodeSlotInput,
  ): Promise<void> {
    return integrationWhatsappRepository.releaseVerificationCodeSlot(input)
  }
}

export const integrationWhatsappService = new IntegrationWhatsappService()
