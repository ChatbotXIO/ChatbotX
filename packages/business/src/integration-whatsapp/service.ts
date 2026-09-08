import {
  and,
  type DatabaseClient,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import type { WhatsappRegistrationStatus } from "@chatbotx.io/database/partials"
import {
  integrationWhatsappRepository,
  LIVE_RUN_STATUSES,
  metaCapiEventRepository,
  whatsappSignupSessionRepository,
} from "@chatbotx.io/database/repositories"
import {
  coexistSyncRunModel,
  type IntegrationWhatsappRegistrationError,
  integrationWhatsappModel,
  whatsappCoexistStagingModel,
} from "@chatbotx.io/database/schema"
import type {
  IntegrationWhatsappModel,
  WhatsappSignupSessionModel,
} from "@chatbotx.io/database/types"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import type { ChannelError } from "@chatbotx.io/sdk"
import { z } from "zod"
import { BaseService } from "../base.service"
import { inboxService } from "../inbox/service"
import { logger } from "../logger"
import { createDatasetWithFallback } from "../meta-conversions/dataset-fallback"
import { platformCredentialService } from "../platform-credential/service"
import { whatsappBusinessAccountService } from "../whatsapp-business-account/service"
import { workspaceService } from "../workspace/service"
import {
  WHATSAPP_CAPI_SCOPE_CACHE_TTL_MS,
  whatsappAuthForCapiScopeSchema,
} from "./auth-schema"
import {
  type SetCoexistInput,
  type SetCoexistResult,
  setCoexist,
} from "./coexist"
import {
  type ConnectPhoneNumberInput,
  type ConnectPhoneNumberResult,
  connectPhoneNumber,
} from "./connect"

export {
  WHATSAPP_CAPI_SCOPE,
  WHATSAPP_CAPI_SCOPE_CACHE_TTL_MS,
  whatsappAuthForCapiScopeSchema,
} from "./auth-schema"
export {
  type SetCoexistInput,
  type SetCoexistResult,
  type SetCoexistTriggerSync,
  type SetCoexistTriggerSyncResult,
  WHATSAPP_COEXIST_SYNC_TYPES,
  type WhatsappCoexistSyncType,
} from "./coexist"
export type {
  ConnectPhoneNumberInput,
  ConnectPhoneNumberResult,
} from "./connect"

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
    /** WABA display name — turn into the dataset name so it is not "unknown". */
    wabaName: string
    accessToken: string
  }) => Promise<string>
}

// `isManual` is set only for manual token-entry connections; embedded-signup
// (OAuth) connections leave it undefined. It gates whether the agency System
// User has access to the WABA (see `resolveDatasetCreationTokens`).
const whatsappConnectionTypeSchema = z.object({
  metadata: z.object({ isManual: z.boolean().optional() }).optional(),
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

type FindActiveSignupSessionForUserInput = {
  id: string
  userId: string
  tx?: DatabaseClient
}

/**
 * A WhatsApp signup-session row with its access token decrypted. Exported so
 * callers (`apps/builder`'s connect action) can type the already-verified
 * session they thread through `prepareConnectInput` without re-deriving the
 * shape from `findActiveSignupSessionForUser`'s return type.
 */
export type WhatsappSignupSessionAuthorized = WhatsappSignupSessionModel & {
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

    return whatsappSignupSessionRepository.createSignupSession({
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
   * can finish its provider calls before committing to the single use, then
   * decrypts the stored access token for it. Deliberately not ownerId-scoped
   * — see `whatsappSignupSessionRepository.findActiveSignupSessionForUser`.
   */
  async findActiveSignupSessionForUser(
    input: FindActiveSignupSessionForUserInput,
  ): Promise<WhatsappSignupSessionAuthorized | null> {
    const session =
      await whatsappSignupSessionRepository.findActiveSignupSessionForUser(
        input,
      )

    return session ? await this.withAccessToken(session) : null
  }

  purgeFinishedSignupSessions(input?: {
    now?: Date
    batchSize?: number
  }): Promise<number> {
    return whatsappSignupSessionRepository.purgeFinishedSignupSessions(input)
  }

  private async withAccessToken(
    session: WhatsappSignupSessionModel,
  ): Promise<WhatsappSignupSessionAuthorized> {
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

  /**
   * No workspace scope — for the inbound webhook-verification handler, which
   * has not yet resolved a workspace when it stamps `webhookVerifiedAt`.
   */
  markWebhookVerified(
    id: string,
    auth: Record<string, unknown>,
  ): Promise<void> {
    return integrationWhatsappRepository.updateAuthUnscoped(id, auth)
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

    await this.audit("update", "re-authorized the WhatsApp Business Account")

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
    const { primaryToken, fallbackToken } =
      await this.resolveDatasetCreationTokens({
        integration: existing,
        workspaceId: input.workspaceId,
        connectToken: auth.tokens.accessToken,
      })
    const datasetId = await createDatasetWithFallback({
      primaryToken,
      fallbackToken,
      create: (accessToken) =>
        input.provision({
          wabaId: existing.wabaId,
          wabaName: existing.name,
          accessToken,
        }),
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
   * The `primaryToken` used to CREATE a Meta CAPI dataset for a WhatsApp
   * integration, plus the `fallbackToken` to retry with when Meta rejects the
   * primary for authorization reasons (see `createDatasetWithFallback`).
   *
   * Embedded-signup (OAuth) connections had the agency System User added to
   * their WABA (`addSystemUser`), so the dataset is created with that
   * system-user token — Meta then attributes the dataset "Creator" to the
   * business, not the personal user who connected — falling back to the connect
   * token if that system user cannot create the dataset. Manual token-entry
   * connections have no such system user on their WABA, and owners without a
   * WhatsApp credential have no system-user token, so both use the connect token
   * with no fallback. Either way, provisioning never regresses.
   */
  async resolveDatasetCreationTokens(input: {
    integration: { auth: unknown }
    workspaceId: string
    connectToken: string
    tx?: DatabaseClient
  }): Promise<{ primaryToken: string; fallbackToken: string | null }> {
    const connection = whatsappConnectionTypeSchema.safeParse(
      input.integration.auth,
    )
    if (connection.success && connection.data.metadata?.isManual) {
      return { primaryToken: input.connectToken, fallbackToken: null }
    }

    const workspace = await workspaceService.findById({
      id: input.workspaceId,
      tx: input.tx,
    })
    const systemUserToken =
      await platformCredentialService.resolveWhatsappSystemUserToken({
        ownerId: workspace.ownerId,
        tx: input.tx,
      })
    if (!systemUserToken) {
      return { primaryToken: input.connectToken, fallbackToken: null }
    }

    return {
      primaryToken: systemUserToken,
      fallbackToken: input.connectToken,
    }
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

  /**
   * Persists a WhatsApp phone-number connect. See `./connect.ts` for the
   * full contract (per-number signup-session claim, one-shot workspace
   * bind, upsert).
   */
  connectPhoneNumber(
    input: ConnectPhoneNumberInput,
  ): Promise<ConnectPhoneNumberResult> {
    return connectPhoneNumber(input)
  }

  /**
   * Flips WhatsApp Coexistence on/off. See `./coexist.ts` for the full
   * contract (run creation, sequential state/history trigger, error
   * strings).
   */
  setCoexist(input: SetCoexistInput): Promise<SetCoexistResult> {
    return setCoexist(input)
  }

  /** Mark that the operator declined the coexist history-import prompt. */
  markHistoryDeclined(props: { id: string }): Promise<void> {
    return integrationWhatsappRepository.markHistoryDeclined(props)
  }

  /**
   * Everything one disconnect must abandon or delete, in a single
   * transaction. Sync history (importedCount / lastSyncedAt / …) is
   * deliberately preserved for audit and so a reconnect can resume from the
   * prior watermark; only ACTIVE runs are abandoned so the scheduler stops
   * trying to drive them forward against a now-missing integration.
   * `LIVE_RUN_STATUSES` includes `waiting`: a WhatsApp coexist run parked for
   * more Meta history must be abandoned here too, otherwise the scheduler
   * cannot revive it (its staging rows are deleted below) and it lingers
   * until the 24h history-window timeout closes it.
   */
  async disconnect(props: {
    integrationWhatsapp: IntegrationWhatsappModel
    ownerId: string
    workspaceId: string
    tx: DatabaseClient
  }): Promise<void> {
    const { integrationWhatsapp, ownerId, workspaceId, tx } = props

    await tx
      .update(coexistSyncRunModel)
      .set({
        status: "failed",
        finishedAt: new Date(),
        currentError: "Integration disconnected",
      })
      .where(
        and(
          eq(coexistSyncRunModel.integrationId, integrationWhatsapp.id),
          inArray(coexistSyncRunModel.status, LIVE_RUN_STATUSES),
        ),
      )

    await tx
      .delete(whatsappCoexistStagingModel)
      .where(
        eq(
          whatsappCoexistStagingModel.phoneNumberId,
          integrationWhatsapp.phoneNumberId,
        ),
      )

    // Polymorphic FK cleanup — no DB-level cascade for
    // MetaCapiEvent.integrationId; stale rows would keep occupying the
    // (workspaceId, channel, sourceKey) dedup slot after a reconnect.
    await metaCapiEventRepository.deleteByIntegration(
      {
        workspaceId,
        channel: "whatsapp",
        integrationId: integrationWhatsapp.id,
      },
      tx,
    )

    await tx
      .delete(integrationWhatsappModel)
      .where(eq(integrationWhatsappModel.id, integrationWhatsapp.id))

    // The business-account credential outlives a single number, so it is only
    // dropped once this workspace has no other number on that account.
    await whatsappBusinessAccountService.deleteIfOrphaned({
      workspaceId,
      wabaId: integrationWhatsapp.wabaId,
      tx,
    })

    await inboxService.disconnect({
      inboxId: integrationWhatsapp.inboxId,
      ownerId,
      workspaceId,
      reason: "manual",
      tx,
    })
  }
}

export const integrationWhatsappService = new IntegrationWhatsappService()
