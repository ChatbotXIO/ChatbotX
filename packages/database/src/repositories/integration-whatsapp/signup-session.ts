import type { EncryptedData } from "@chatbotx.io/encryption"
import {
  and,
  arrayContains,
  type DatabaseClient,
  db,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  not,
  or,
  sql,
} from "../../client"
import { whatsappSignupSessionModel } from "../../schema"
import type { WhatsappSignupSessionModel } from "../../types"

/**
 * How long a phone-number selection stays usable. The user only has to pick a
 * number from a list already on screen, so this is generous; the window exists
 * to bound how long the signup access token sits at rest.
 */
export const WHATSAPP_SIGNUP_SESSION_TTL_MS = 10 * 60 * 1000

/** Caps how many rows one purge pass deletes, to keep the lock window short. */
const SIGNUP_SESSION_PURGE_BATCH_SIZE = 500

export type CreateWhatsappSignupSessionInput = {
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

/**
 * Identity/ownership plus the phone number being acted on — the shape
 * `claimSignupSessionPhoneNumber` (per-number claim) needs.
 */
export type ClaimSignupSessionPhoneNumberInput = {
  id: string
  userId: string
  ownerId: string
  phoneNumberId: string
  now?: Date
  tx?: DatabaseClient
}

// Deliberately not ownerId-scoped — see `findActiveSignupSessionForUser`.
export type FindActiveSignupSessionForUserInput = {
  id: string
  userId: string
  now?: Date
  tx?: DatabaseClient
}

export type BindSignupSessionWorkspaceInput = {
  id: string
  workspaceId: string
  tx?: DatabaseClient
}

export type PurgeWhatsappSignupSessionsInput = {
  now?: Date
  batchSize?: number
  tx?: DatabaseClient
}

// Deliberately not ownerId-scoped — see `findActiveSignupSessionForUser`.
const activeSignupSessionByIdForUserFilter = (
  input: { id: string; userId: string },
  now: Date,
) =>
  and(
    eq(whatsappSignupSessionModel.id, input.id),
    eq(whatsappSignupSessionModel.userId, input.userId),
    gt(whatsappSignupSessionModel.expiresAt, now),
  )

/**
 * Matches the one row a per-number claim is allowed to update: the session
 * is still valid, the number was offered as a candidate, and it hasn't been
 * claimed yet. Concurrent claims of the same number contend on this filter —
 * exactly one UPDATE matches. Still scoped by `ownerId` — the claim is the
 * write that actually spends the session, so it keeps the stricter,
 * caller-verified identity (`connect.action.ts` passes the session's own
 * `ownerId`, already checked against the resolved platform owner).
 */
const claimableSignupSessionFilter = (
  input: { id: string; userId: string; ownerId: string; phoneNumberId: string },
  now: Date,
) =>
  and(
    eq(whatsappSignupSessionModel.id, input.id),
    eq(whatsappSignupSessionModel.userId, input.userId),
    eq(whatsappSignupSessionModel.ownerId, input.ownerId),
    gt(whatsappSignupSessionModel.expiresAt, now),
    arrayContains(whatsappSignupSessionModel.candidatePhoneNumberIds, [
      input.phoneNumberId,
    ]),
    not(
      arrayContains(whatsappSignupSessionModel.claimedPhoneNumberIds, [
        input.phoneNumberId,
      ]),
    ),
  )

class WhatsappSignupSessionRepository {
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
   *
   * Scoped by id + `userId` and expiry only — NOT by `ownerId`, `consumedAt`,
   * or candidacy for a specific number. The caller (`connect.action.ts`)
   * verifies the returned row's `ownerId` itself, since only after this read
   * does it know which `workspaceId` to resolve the expected owner from.
   * Candidacy is a per-number concern, checked by
   * `claimSignupSessionPhoneNumber`; a session with unclaimed candidates is
   * never "consumed" even after some numbers are already claimed, so this
   * read must keep returning it.
   */
  async findActiveSignupSessionForUser(
    input: FindActiveSignupSessionForUserInput,
  ): Promise<WhatsappSignupSessionModel | null> {
    const { tx = db, now = new Date() } = input
    const [row] = await tx
      .select()
      .from(whatsappSignupSessionModel)
      .where(activeSignupSessionByIdForUserFilter(input, now))
      .limit(1)

    return row ?? null
  }

  /**
   * Atomically claims one candidate phone number from a signup session:
   * appends it to `claimedPhoneNumberIds`, and stamps `consumedAt` once every
   * candidate has been claimed. Runs inside the connect transaction for that
   * number, so a rollback releases the claim (the append never committed) and
   * a retry on the same number can claim it again.
   *
   * The WHERE clause is the single-claim guarantee: it only matches a
   * candidate that (a) belongs to this session/owner/user, (b) hasn't
   * expired, and (c) hasn't been claimed yet — so two concurrent claims of
   * the same number can never both succeed. That guarantee comes from
   * Postgres's row-level locking on the UPDATE and cannot itself be verified
   * with a mocked db client — the repository tests for this method only
   * assert the filter/SET expressions passed to the (mocked) drizzle
   * operators, and replay the two possible outcomes (a row, or none).
   */
  async claimSignupSessionPhoneNumber(
    input: ClaimSignupSessionPhoneNumberInput,
  ): Promise<WhatsappSignupSessionModel | null> {
    const { tx = db, now = new Date() } = input
    const [row] = await tx
      .update(whatsappSignupSessionModel)
      .set({
        claimedPhoneNumberIds: sql`array_append(${whatsappSignupSessionModel.claimedPhoneNumberIds}, ${input.phoneNumberId})`,
        consumedAt: sql`CASE WHEN cardinality(array_append(${whatsappSignupSessionModel.claimedPhoneNumberIds}, ${input.phoneNumberId})) = cardinality(${whatsappSignupSessionModel.candidatePhoneNumberIds}) THEN now() ELSE ${whatsappSignupSessionModel.consumedAt} END`,
      })
      .where(claimableSignupSessionFilter(input, now))
      .returning()

    return row ?? null
  }

  /**
   * Sets the session's `workspaceId` the first time a number claims it —
   * `WHERE workspaceId IS NULL` makes this a one-shot write, so a second
   * call is a no-op.
   */
  async bindSignupSessionWorkspace(
    input: BindSignupSessionWorkspaceInput,
  ): Promise<void> {
    const { tx = db } = input
    await tx
      .update(whatsappSignupSessionModel)
      .set({ workspaceId: input.workspaceId })
      .where(
        and(
          eq(whatsappSignupSessionModel.id, input.id),
          isNull(whatsappSignupSessionModel.workspaceId),
        ),
      )
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

export const whatsappSignupSessionRepository =
  new WhatsappSignupSessionRepository()
