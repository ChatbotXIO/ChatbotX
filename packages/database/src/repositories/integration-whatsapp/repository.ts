import type { EncryptedData } from "@chatbotx.io/encryption"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "../../client"
import {
  type IntegrationWhatsappRegistrationError,
  integrationWhatsappModel,
} from "../../schema"
import type { IntegrationWhatsappModel } from "../../types"

// `isCoexist`/`platformType` have column defaults (both `$inferInsert`
// makes optional), but a connect must always state them explicitly — the
// only caller (`connectPhoneNumber`) always passes both, and `Required`
// keeps that invariant enforced by the type instead of just convention.
type UpsertWhatsappIntegrationInput = Pick<
  typeof integrationWhatsappModel.$inferInsert,
  | "id"
  | "workspaceId"
  | "inboxId"
  | "auth"
  | "phoneNumberId"
  | "wabaId"
  | "businessId"
  | "name"
  | "displayPhoneNumber"
> &
  Required<
    Pick<
      typeof integrationWhatsappModel.$inferInsert,
      "isCoexist" | "platformType"
    >
  >

type WorkspaceIntegrationRef = {
  id: string
  workspaceId: string
}

type UpdateWhatsappRegistrationInput = WorkspaceIntegrationRef & {
  values: Pick<
    typeof integrationWhatsappModel.$inferInsert,
    "registrationStatus" | "registrationError"
  >
}

type ReplaceWhatsappAuthInput = WorkspaceIntegrationRef & {
  auth: typeof integrationWhatsappModel.$inferInsert.auth
  hasCapiScope: boolean
  capiScopeCheckedAt: Date
}

type UpdateWhatsappCapiScopeCacheInput = WorkspaceIntegrationRef & {
  hasCapiScope: boolean
  // Nullable so the send-path CAS restore (metaConversionsService, meta-conversions
  // send path) can put back a never-checked (null) prior value on a failed refresh.
  capiScopeCheckedAt: Date | null
  expectedCapiScopeCheckedAt: Date | null
}

type ClaimWhatsappCapiScopeCacheRefreshInput = WorkspaceIntegrationRef & {
  capiScopeCheckedAt: Date
  expectedCapiScopeCheckedAt: Date | null
}

type ClaimVerificationCodeSlotInput = WorkspaceIntegrationRef & {
  /** Timestamp written on the row, and the identity of this claim. */
  now: Date
  /** A claim is available once the previous one is older than this. */
  cutoff: Date
}

type ReleaseVerificationCodeSlotInput = WorkspaceIntegrationRef & {
  claimedAt: Date
}

type UpdateDatasetIdIfNullInput = WorkspaceIntegrationRef & {
  datasetId: string
}

type UpdateCapiTestEventCodeInput = WorkspaceIntegrationRef & {
  capiTestEventCode: string | null
}

type UpdateCapiAccessTokenInput = WorkspaceIntegrationRef & {
  capiAccessToken: EncryptedData
}

const workspaceIntegrationFilter = (input: WorkspaceIntegrationRef) =>
  and(
    eq(integrationWhatsappModel.id, input.id),
    eq(integrationWhatsappModel.workspaceId, input.workspaceId),
  )

/**
 * Compare-and-swap guard for the CAPI scope cache: matches the integration only
 * while its `capiScopeCheckedAt` still equals the value the caller read. Shared
 * by the claim and the write-back so both sides use identical optimistic-lock
 * semantics (`IS NOT DISTINCT FROM` also matches the initial NULL).
 */
const capiScopeCasFilter = (
  input: WorkspaceIntegrationRef & { expectedCapiScopeCheckedAt: Date | null },
) =>
  and(
    workspaceIntegrationFilter(input),
    sql`${integrationWhatsappModel.capiScopeCheckedAt} IS NOT DISTINCT FROM ${input.expectedCapiScopeCheckedAt}`,
  )

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

  findAllForTokenRefresh(tx: DatabaseClient = db) {
    return tx
      .select({
        id: integrationWhatsappModel.id,
        workspaceId: integrationWhatsappModel.workspaceId,
        auth: integrationWhatsappModel.auth,
      })
      .from(integrationWhatsappModel)
  }

  findForTokenRefreshByWorkspaceIds(
    workspaceIds: string[],
    tx: DatabaseClient = db,
  ) {
    if (workspaceIds.length === 0) {
      return Promise.resolve([])
    }
    return tx
      .select({
        id: integrationWhatsappModel.id,
        workspaceId: integrationWhatsappModel.workspaceId,
        auth: integrationWhatsappModel.auth,
      })
      .from(integrationWhatsappModel)
      .where(inArray(integrationWhatsappModel.workspaceId, workspaceIds))
  }

  async findByIdForWorkspace(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel | null> {
    const [row] = await tx
      .select()
      .from(integrationWhatsappModel)
      .where(workspaceIntegrationFilter(input))
      .limit(1)

    return row ?? null
  }

  /**
   * Replace the stored OAuth credentials after a token refresh. Scoped by
   * workspace so a forged integration id can never touch another tenant's row.
   */
  async updateAuth(
    input: WorkspaceIntegrationRef & { auth: Record<string, unknown> },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(integrationWhatsappModel)
      .set({ auth: input.auth, tokenRefreshError: null })
      .where(workspaceIntegrationFilter(input))
  }

  async markTokenRefreshError(
    id: string,
    error: string,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(integrationWhatsappModel)
      .set({ tokenRefreshError: error })
      .where(eq(integrationWhatsappModel.id, id))
  }

  /**
   * No workspace scope — called from the inbound webhook-verification handler
   * before a workspace context is resolved.
   */
  async updateAuthUnscoped(
    id: string,
    auth: Record<string, unknown>,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(integrationWhatsappModel)
      .set({ auth })
      .where(eq(integrationWhatsappModel.id, id))
  }

  /**
   * Resolves the WhatsApp integration that owns a given `Inbox.id`. Ads
   * conversion trigger hook points (tag applied, keyword matched, contact
   * replied) only have the inbox/contactInbox in scope, not the integration
   * id the job data requires — this is how they get it.
   */
  async findWorkspaceIntegrationByInboxId(
    input: { workspaceId: string; inboxId: string },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; wabaId: string } | null> {
    const [row] = await tx
      .select({
        id: integrationWhatsappModel.id,
        wabaId: integrationWhatsappModel.wabaId,
      })
      .from(integrationWhatsappModel)
      .where(
        and(
          eq(integrationWhatsappModel.inboxId, input.inboxId),
          eq(integrationWhatsappModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)

    return row ?? null
  }

  /**
   * Same lookup as `findWorkspaceIntegrationByInboxId` but returns the full
   * row. Used by the explicit "Send Meta CAPI Event" action (Meta Conversions
   * API), which needs `auth`/`hasCapiScope`/`datasetId` and not just the id
   * pair — a separate method so the existing partial-column query and its
   * callers are untouched.
   */
  async findByInboxIdForWorkspace(
    input: { workspaceId: string; inboxId: string },
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel | null> {
    const [row] = await tx
      .select()
      .from(integrationWhatsappModel)
      .where(
        and(
          eq(integrationWhatsappModel.inboxId, input.inboxId),
          eq(integrationWhatsappModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)

    return row ?? null
  }

  /**
   * Records that the user declined chat-history sharing in the WhatsApp
   * Business app. Terminal for coexist history on this number — Meta will
   * never push it — so the UI hides the retry CTA.
   */
  async markHistoryDeclined(
    input: { id: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(integrationWhatsappModel)
      .set({ historyDeclined: true, updatedAt: new Date() })
      .where(eq(integrationWhatsappModel.id, input.id))
  }

  async findByPhoneNumberId(
    input: { phoneNumberId: string; wabaId?: string },
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel | null> {
    const [row] = await tx
      .select()
      .from(integrationWhatsappModel)
      .where(
        and(
          eq(integrationWhatsappModel.phoneNumberId, input.phoneNumberId),
          input.wabaId
            ? eq(integrationWhatsappModel.wabaId, input.wabaId)
            : undefined,
        ),
      )
      .limit(1)

    return row ?? null
  }

  listByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<
    (IntegrationWhatsappModel & {
      inbox?: { id: string; name: string } | null
    })[]
  > {
    return tx.query.integrationWhatsappModel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      with: {
        inbox: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    })
  }

  async findVerificationCodeRequestedAt(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<{ verificationCodeRequestedAt: Date | null } | null> {
    const [row] = await tx
      .select({
        verificationCodeRequestedAt:
          integrationWhatsappModel.verificationCodeRequestedAt,
      })
      .from(integrationWhatsappModel)
      .where(workspaceIntegrationFilter(input))
      .limit(1)

    return row ?? null
  }

  async updateRegistration(
    input: UpdateWhatsappRegistrationInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappRegistrationError | null> {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set(input.values)
      .where(workspaceIntegrationFilter(input))
      .returning({
        registrationError: integrationWhatsappModel.registrationError,
      })

    return row?.registrationError ?? null
  }

  async updateCapiScopeCache(
    input: UpdateWhatsappCapiScopeCacheInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel | null> {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set({
        hasCapiScope: input.hasCapiScope,
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      })
      .where(capiScopeCasFilter(input))
      .returning()

    return row ?? this.findByIdForWorkspace(input, tx)
  }

  async claimCapiScopeCacheRefresh(
    input: ClaimWhatsappCapiScopeCacheRefreshInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel | null> {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set({
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      })
      .where(capiScopeCasFilter(input))
      .returning()

    return row ?? null
  }

  async replaceAuth(
    input: ReplaceWhatsappAuthInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel | null> {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set({
        auth: input.auth,
        hasCapiScope: input.hasCapiScope,
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  }

  async updateDatasetIdIfNull(
    input: UpdateDatasetIdIfNullInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel | null> {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set({ datasetId: input.datasetId })
      .where(
        and(
          workspaceIntegrationFilter(input),
          isNull(integrationWhatsappModel.datasetId),
        ),
      )
      .returning()

    return row ?? null
  }

  /**
   * Unconditional write — a user-entered dataset id must be able to
   * overwrite one that was auto-provisioned by the lazy send-path.
   */
  async updateDatasetId(
    input: UpdateDatasetIdIfNullInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel | null> {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set({ datasetId: input.datasetId })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  }

  async updateCapiTestEventCode(
    input: UpdateCapiTestEventCodeInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel | null> {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set({ capiTestEventCode: input.capiTestEventCode })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  }

  async updateCapiAccessToken(
    input: UpdateCapiAccessTokenInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel | null> {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set({ capiAccessToken: input.capiAccessToken })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  }

  /**
   * Custom connection: writes dataset id, encrypted token, and clears the
   * disconnect flag in one atomic update — mirrors
   * `integrationMessengerRepository.connectCustomCapi`.
   */
  async connectCustomCapi(
    input: WorkspaceIntegrationRef & {
      datasetId: string
      capiAccessToken: EncryptedData
    },
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel | null> {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set({
        datasetId: input.datasetId,
        capiAccessToken: input.capiAccessToken,
        capiDisconnectedAt: null,
      })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  }

  async setCapiDisconnectedAt(
    input: WorkspaceIntegrationRef & { capiDisconnectedAt: Date },
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel | null> {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set({
        capiDisconnectedAt: input.capiDisconnectedAt,
        capiAccessToken: null,
      })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  }

  async clearCapiDisconnectedAt(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel | null> {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set({ capiDisconnectedAt: null })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  }

  async clearCapiAccessToken(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel | null> {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set({ capiAccessToken: null })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  }

  /**
   * Conditionally stamps the request time, which is what rate-limits outbound
   * verification-code requests: concurrent callers contend on the same row and
   * only the one whose UPDATE matches gets a timestamp back.
   */
  async claimVerificationCodeSlot(
    input: ClaimVerificationCodeSlotInput,
    tx: DatabaseClient = db,
  ): Promise<Date | null> {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set({ verificationCodeRequestedAt: input.now })
      .where(
        and(
          workspaceIntegrationFilter(input),
          or(
            isNull(integrationWhatsappModel.verificationCodeRequestedAt),
            lt(
              integrationWhatsappModel.verificationCodeRequestedAt,
              input.cutoff,
            ),
          ),
        ),
      )
      .returning({
        requestedAt: integrationWhatsappModel.verificationCodeRequestedAt,
      })

    return row?.requestedAt ?? null
  }

  /**
   * Withdraws a claim by comparing against the exact timestamp it wrote, so a
   * slow release can never wipe out a newer claim.
   *
   * Clearing rather than restoring the previous value is safe: a slot is only
   * claimable once the previous request is past its cooldown, so the value
   * being discarded was already spent.
   */
  async releaseVerificationCodeSlot(
    input: ReleaseVerificationCodeSlotInput,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(integrationWhatsappModel)
      .set({ verificationCodeRequestedAt: null })
      .where(
        and(
          workspaceIntegrationFilter(input),
          eq(
            integrationWhatsappModel.verificationCodeRequestedAt,
            input.claimedAt,
          ),
        ),
      )
  }

  /**
   * Upserts a WhatsApp integration keyed by `inboxId` (today's
   * `onConflictDoUpdate`, moved verbatim): a retry after a lost response
   * re-writes the same row instead of colliding on `IntegrationWhatsapp_
   * inboxId_key`.
   */
  async upsertByInbox(
    input: UpsertWhatsappIntegrationInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationWhatsappModel> {
    const [row] = await tx
      .insert(integrationWhatsappModel)
      .values({
        ...input,
        registrationStatus: "pending_verification",
      })
      .onConflictDoUpdate({
        target: [integrationWhatsappModel.inboxId],
        set: {
          name: input.name,
          displayPhoneNumber: input.displayPhoneNumber,
          isCoexist: input.isCoexist,
          platformType: input.platformType,
          updatedAt: new Date(),
        },
      })
      .returning()

    return row
  }
}

export const integrationWhatsappRepository = new IntegrationWhatsappRepository()
