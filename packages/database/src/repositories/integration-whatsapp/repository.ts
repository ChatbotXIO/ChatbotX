import type { EncryptedData } from "@chatbotx.io/encryption"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "../../client"
import {
  type IntegrationWhatsappRegistrationError,
  integrationWhatsappModel,
  whatsappSignupSessionModel,
} from "../../schema"
import type {
  IntegrationWhatsappModel,
  WhatsappSignupSessionModel,
} from "../../types"

/**
 * How long a phone-number selection stays usable. The user only has to pick a
 * number from a list already on screen, so this is generous; the window exists
 * to bound how long the signup access token sits at rest.
 */
export const WHATSAPP_SIGNUP_SESSION_TTL_MS = 10 * 60 * 1000

/** Caps how many rows one purge pass deletes, to keep the lock window short. */
const SIGNUP_SESSION_PURGE_BATCH_SIZE = 500

type CreateWhatsappSignupSessionInput = {
  userId: string
  ownerId: string
  workspaceId?: string | null
  wabaId: string
  businessId: string
  encryptedAccessToken: EncryptedData
  apiVersion: string
  candidatePhoneNumberIds: string[]
  now?: Date
}

type WhatsappSignupSessionClaimInput = {
  id: string
  userId: string
  ownerId: string
  phoneNumberId: string
  now?: Date
  tx?: DatabaseClient
}

type PurgeWhatsappSignupSessionsInput = {
  now?: Date
  batchSize?: number
  tx?: DatabaseClient
}

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

type ClaimVerificationCodeSlotInput = WorkspaceIntegrationRef & {
  /** Timestamp written on the row, and the identity of this claim. */
  now: Date
  /** A claim is available once the previous one is older than this. */
  cutoff: Date
}

type ReleaseVerificationCodeSlotInput = WorkspaceIntegrationRef & {
  claimedAt: Date
}

const workspaceIntegrationFilter = (input: WorkspaceIntegrationRef) =>
  and(
    eq(integrationWhatsappModel.id, input.id),
    eq(integrationWhatsappModel.workspaceId, input.workspaceId),
  )

/**
 * Matches exactly one session a caller is allowed to act on: theirs, not yet
 * consumed, not yet expired, and offering the phone number they picked.
 *
 * Shared by the read and the claim so a session can never pass the lookup and
 * then fail the update for a reason the caller was not told about.
 */
const activeSignupSessionFilter = (
  input: Omit<WhatsappSignupSessionClaimInput, "tx" | "now">,
  now: Date,
) =>
  and(
    eq(whatsappSignupSessionModel.id, input.id),
    eq(whatsappSignupSessionModel.userId, input.userId),
    eq(whatsappSignupSessionModel.ownerId, input.ownerId),
    isNull(whatsappSignupSessionModel.consumedAt),
    gt(whatsappSignupSessionModel.expiresAt, now),
    sql`${input.phoneNumberId} = ANY(${whatsappSignupSessionModel.candidatePhoneNumberIds})`,
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

  async findWorkspaceIntegration(
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

  async createSignupSession(
    input: CreateWhatsappSignupSessionInput,
    tx: DatabaseClient = db,
  ): Promise<WhatsappSignupSessionModel> {
    const now = input.now ?? new Date()
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
        expiresAt: new Date(now.getTime() + WHATSAPP_SIGNUP_SESSION_TTL_MS),
      })
      .returning()

    if (!row) {
      throw new Error("Failed to create WhatsApp signup session")
    }

    return row
  }

  /**
   * Reads a session without spending it, so the connect flow can do its
   * network work before committing to the single use.
   */
  async findActiveSignupSession(
    input: WhatsappSignupSessionClaimInput,
  ): Promise<WhatsappSignupSessionModel | null> {
    const { tx = db, now = new Date() } = input
    const [row] = await tx
      .select()
      .from(whatsappSignupSessionModel)
      .where(activeSignupSessionFilter(input, now))
      .limit(1)

    return row ?? null
  }

  /**
   * Spends the session. The conditional UPDATE is the single-use guarantee:
   * concurrent connects contend on the same row and only one sees a result.
   *
   * Pass the connect transaction as `tx` so the session is spent only if the
   * integration it authorizes is actually written.
   */
  async consumeSignupSession(
    input: WhatsappSignupSessionClaimInput,
  ): Promise<WhatsappSignupSessionModel | null> {
    const { tx = db, now = new Date() } = input
    const [row] = await tx
      .update(whatsappSignupSessionModel)
      .set({ consumedAt: now })
      .where(activeSignupSessionFilter(input, now))
      .returning()

    return row ?? null
  }

  /**
   * Drops sessions that can never be used again. Each row holds an encrypted
   * signup access token, so this bounds how long that token is retained.
   *
   * Returns how many rows were removed so a scheduler can keep calling until a
   * pass comes back empty, without having to know `batchSize`.
   */
  async purgeFinishedSignupSessions(
    input: PurgeWhatsappSignupSessionsInput = {},
  ): Promise<number> {
    const {
      tx = db,
      now = new Date(),
      batchSize = SIGNUP_SESSION_PURGE_BATCH_SIZE,
    } = input

    const finishedIds = tx
      .select({ id: whatsappSignupSessionModel.id })
      .from(whatsappSignupSessionModel)
      .where(
        or(
          isNotNull(whatsappSignupSessionModel.consumedAt),
          lte(whatsappSignupSessionModel.expiresAt, now),
        ),
      )
      .limit(batchSize)

    const deleted = await tx
      .delete(whatsappSignupSessionModel)
      .where(inArray(whatsappSignupSessionModel.id, finishedIds))
      .returning({ id: whatsappSignupSessionModel.id })

    return deleted.length
  }
}

export const integrationWhatsappRepository = new IntegrationWhatsappRepository()
