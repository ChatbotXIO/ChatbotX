import { and, type DatabaseClient, db, eq } from "../../client"
import type { AiHandoverChannel } from "../../partials"
import { aiHandoverSettingsModel, inboxModel } from "../../schema"
import type { AiHandoverSettingsModel } from "../../types"

/** A Page, always scoped by its workspace so an id alone never crosses tenants. */
export type AiHandoverSettingsInboxRef = {
  workspaceId: string
  inboxId: string
}

export type UpsertAiHandoverSettingsInput = AiHandoverSettingsInboxRef & {
  channel: AiHandoverChannel
} & Pick<
    typeof aiHandoverSettingsModel.$inferInsert,
    | "enabled"
    | "scheduleEnabled"
    | "timeRanges"
    | "gotoFlowId"
    | "returnMessage"
    | "pauseBotWaitingForStaff"
  >

export type SetApplyToAllInput = AiHandoverSettingsInboxRef & {
  applyToAllCustomers: boolean
  /** The HUMAN_AGENT text of an OFF; `null` for an ON. */
  applyToAllMessage: string | null
  requestedByUserId: string | null
}

/** The settings row with its Page's connection status, read in one statement. */
export type AiHandoverSettingsWithInbox = {
  settings: AiHandoverSettingsModel
  inboxStatus: string
}

const inboxWhere = (input: AiHandoverSettingsInboxRef) =>
  and(
    eq(aiHandoverSettingsModel.workspaceId, input.workspaceId),
    eq(aiHandoverSettingsModel.inboxId, input.inboxId),
  )

export const aiHandoverSettingsRepository = {
  async findByInbox(
    input: AiHandoverSettingsInboxRef,
    tx: DatabaseClient = db,
  ): Promise<AiHandoverSettingsModel | null> {
    const [row] = await tx
      .select()
      .from(aiHandoverSettingsModel)
      .where(inboxWhere(input))
      .limit(1)

    return row ?? null
  },

  /**
   * Atomic create-or-replace on the Page's unique key, so two concurrent saves
   * converge on one row instead of one failing. Every setting is written
   * explicitly (none relies on a column default); the "apply to all" columns
   * belong to `setApplyToAll` and are left alone on conflict.
   */
  async upsert(
    input: UpsertAiHandoverSettingsInput,
    tx: DatabaseClient = db,
  ): Promise<AiHandoverSettingsModel> {
    const { workspaceId, inboxId, channel, ...settings } = input
    const [row] = await tx
      .insert(aiHandoverSettingsModel)
      .values({
        workspaceId,
        inboxId,
        channel,
        ...settings,
        applyToAllCustomers: false,
        applyToAllRevision: 0,
        applyToAllMessage: null,
        applyToAllRequestedByUserId: null,
      })
      .onConflictDoUpdate({
        target: aiHandoverSettingsModel.inboxId,
        set: settings,
      })
      .returning()

    if (!row) {
      throw new Error("Failed to upsert business AI settings")
    }
    return row
  },

  /**
   * The Page's existing settings row with its inbox's status, locked
   * `FOR UPDATE` (the settings row only) for the rest of the transaction;
   * `null` when the Page has none. Everything that decides whether a run exists
   * for a Page (desired-state changes, reconcile, a disconnect's cancel) takes
   * this lock first, so none of them can interleave: the state each reads,
   * including whether the Page is connected, is the state it acts on.
   */
  async lockExisting(
    input: AiHandoverSettingsInboxRef,
    tx: DatabaseClient,
  ): Promise<AiHandoverSettingsWithInbox | null> {
    const [settings] = await tx
      .select()
      .from(aiHandoverSettingsModel)
      .where(inboxWhere(input))
      .limit(1)
      .for("update")
    if (!settings) {
      return null
    }
    // A statement of its own, after the lock: under READ COMMITTED each
    // statement takes a fresh snapshot, so a disconnect that committed while
    // this transaction waited for the lock is seen. Joined into the locking
    // statement, the Inbox row would keep the snapshot from before the wait.
    const [inbox] = await tx
      .select({ status: inboxModel.status })
      .from(inboxModel)
      .where(eq(inboxModel.id, input.inboxId))
      .limit(1)
    return { settings, inboxStatus: inbox?.status ?? "disconnected" }
  },

  /**
   * `lockExisting` for a Page that may have no row yet: one is created
   * switched off (only a real change of the desired state needs it), then
   * locked.
   */
  async lockForApplyToAll(
    input: AiHandoverSettingsInboxRef & { channel: AiHandoverChannel },
    tx: DatabaseClient,
  ): Promise<AiHandoverSettingsWithInbox> {
    await tx
      .insert(aiHandoverSettingsModel)
      .values({
        workspaceId: input.workspaceId,
        inboxId: input.inboxId,
        channel: input.channel,
        enabled: false,
        scheduleEnabled: false,
        timeRanges: [],
        gotoFlowId: null,
        returnMessage: null,
        pauseBotWaitingForStaff: false,
        applyToAllCustomers: false,
        applyToAllRevision: 0,
        applyToAllMessage: null,
        applyToAllRequestedByUserId: null,
      })
      .onConflictDoNothing({ target: aiHandoverSettingsModel.inboxId })

    const locked = await this.lockExisting(input, tx)
    if (!locked) {
      throw new Error("Failed to lock business AI settings")
    }
    return locked
  },

  /**
   * Records a real change of the desired state and bumps its revision. The
   * caller holds the row lock (`lockForApplyToAll`) and has already compared
   * against the current value, so a repeated state never reaches here.
   */
  async setApplyToAll(
    input: SetApplyToAllInput,
    tx: DatabaseClient,
  ): Promise<AiHandoverSettingsModel> {
    const current = await this.findByInbox(input, tx)
    const [row] = await tx
      .update(aiHandoverSettingsModel)
      .set({
        applyToAllCustomers: input.applyToAllCustomers,
        applyToAllRevision: (current?.applyToAllRevision ?? 0) + 1,
        applyToAllMessage: input.applyToAllMessage,
        applyToAllRequestedByUserId: input.requestedByUserId,
      })
      .where(inboxWhere(input))
      .returning()

    if (!row) {
      throw new Error("Failed to record the apply-to-all change")
    }
    return row
  },
}
