import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNull,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import { messengerMessageTemplateModel } from "@chatbotx.io/database/schema"
import type { MessengerMessageTemplateModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

/**
 * A template as Meta returns it (`GET|POST /{pageId}/message_templates`),
 * narrowed to the columns this service stores. Kept structural so the
 * business layer does not depend on the integration SDK.
 */
export type MetaMessageTemplateSnapshot = {
  id: string
  name: string
  status: string
  language: string
  category: string
  parameter_format?: string | null
  components: unknown
  rejection_reason?: string | null
}

export const DEFAULT_TEMPLATE_PARAMETER_FORMAT = "POSITIONAL"
const PENDING_TEMPLATE_STATUS = "PENDING"

/**
 * How long a clone reservation is trusted to be in flight. A full sync keeps
 * younger reservations (the Meta create may still be running); an older one
 * is an orphan of a crashed clone and is swept so the pair can be retried.
 */
export const CLONE_RESERVATION_TTL_MS = 15 * 60 * 1000

/**
 * `sourceId` of a clone reservation: the row exists before Meta has assigned
 * an id, and is rewritten with the real id as soon as the create call returns.
 */
export const cloneReservationSourceId = (
  clonedFromTemplateId: string,
): string => `clone:${clonedFromTemplateId}`

export const isCloneReservationSourceId = (sourceId: string): boolean =>
  sourceId.startsWith("clone:")

/** A reservation still young enough that its Meta create may be in flight. */
export const isActiveCloneReservation = (
  row: { sourceId: string; createdAt: Date },
  now: Date = new Date(),
): boolean =>
  isCloneReservationSourceId(row.sourceId) &&
  now.getTime() - row.createdAt.getTime() < CLONE_RESERVATION_TTL_MS

const snapshotColumns = (template: MetaMessageTemplateSnapshot) => ({
  name: template.name,
  language: template.language,
  category: template.category,
  status: template.status,
  parameterFormat:
    template.parameter_format ?? DEFAULT_TEMPLATE_PARAMETER_FORMAT,
  components: template.components,
  rejectionReason: template.rejection_reason ?? null,
})

export type ReserveCloneResult =
  | { outcome: "reserved"; row: MessengerMessageTemplateModel }
  | { outcome: "conflict" }

class MessengerMessageTemplateService extends BaseService {
  /** A template of the workspace, scoped through its page's integration. */
  async findByIdForWorkspace(input: {
    id: string
    workspaceId: string
  }): Promise<MessengerMessageTemplateModel | null> {
    const row = await db.query.messengerMessageTemplateModel.findFirst({
      where: {
        id: input.id,
        integrationMessenger: { workspaceId: input.workspaceId },
      },
    })
    return row ?? null
  }

  /**
   * The row on `integrationMessengerId` that already stands for `source`: the
   * one cloned from it, else one with the same name and language (Meta keys
   * templates by that pair per page). An APPROVED row wins over a stale
   * duplicate.
   */
  async findCloneCandidate(input: {
    integrationMessengerId: string
    clonedFromTemplateId: string
    name: string
    language: string
  }): Promise<MessengerMessageTemplateModel | null> {
    const rows = await db.query.messengerMessageTemplateModel.findMany({
      where: {
        integrationMessengerId: input.integrationMessengerId,
        OR: [
          { clonedFromTemplateId: input.clonedFromTemplateId },
          { name: input.name, language: input.language },
        ],
      },
      orderBy: { createdAt: "asc" },
    })
    return (
      rows.find(
        (row) => row.clonedFromTemplateId === input.clonedFromTemplateId,
      ) ??
      rows.find((row) => row.status === "APPROVED") ??
      rows[0] ??
      null
    )
  }

  /**
   * Claims the (page, source template) pair before calling Meta. The partial
   * unique index on that pair turns a concurrent clone into a `conflict`
   * outcome instead of a second Meta create.
   */
  async reserveClone(input: {
    integrationMessengerId: string
    clonedFromTemplateId: string
    template: Pick<
      MetaMessageTemplateSnapshot,
      "name" | "language" | "category" | "parameter_format" | "components"
    >
  }): Promise<ReserveCloneResult> {
    try {
      const [row] = await db
        .insert(messengerMessageTemplateModel)
        .values({
          id: createId(),
          integrationMessengerId: input.integrationMessengerId,
          clonedFromTemplateId: input.clonedFromTemplateId,
          sourceId: cloneReservationSourceId(input.clonedFromTemplateId),
          ...snapshotColumns({
            ...input.template,
            id: "",
            status: PENDING_TEMPLATE_STATUS,
          }),
        })
        .returning()
      return { outcome: "reserved", row }
    } catch (error) {
      if (isUniqueViolationError(error)) {
        return { outcome: "conflict" }
      }
      throw error
    }
  }

  /**
   * Rewrites a reservation with what Meta actually created. Fails when the
   * reservation is gone (swept as expired), so the caller falls back to
   * re-reading the page by name instead of silently losing Meta's response.
   */
  async fulfillReservation(input: {
    reservationId: string
    template: MetaMessageTemplateSnapshot
  }): Promise<MessengerMessageTemplateModel> {
    const [row] = await db
      .update(messengerMessageTemplateModel)
      .set({ sourceId: input.template.id, ...snapshotColumns(input.template) })
      .where(eq(messengerMessageTemplateModel.id, input.reservationId))
      .returning()
    if (!row) {
      throw new Error(
        `Clone reservation ${input.reservationId} no longer exists`,
      )
    }
    return row
  }

  /** Drops a reservation whose Meta create failed, so the pair can be retried. */
  async discardReservation(reservationId: string): Promise<void> {
    await db
      .delete(messengerMessageTemplateModel)
      .where(eq(messengerMessageTemplateModel.id, reservationId))
  }

  /** Marks an existing row (found by name) as the clone of `clonedFromTemplateId`. */
  async linkClone(input: {
    id: string
    clonedFromTemplateId: string
  }): Promise<void> {
    await db
      .update(messengerMessageTemplateModel)
      .set({ clonedFromTemplateId: input.clonedFromTemplateId })
      .where(
        and(
          eq(messengerMessageTemplateModel.id, input.id),
          isNull(messengerMessageTemplateModel.clonedFromTemplateId),
        ),
      )
  }

  /**
   * Upserts what Meta returned for a page, keyed by (page, sourceId). The
   * conflict update never touches `clonedFromTemplateId`, so a resync keeps
   * the clone link a reservation wrote.
   */
  async upsertFromMeta(input: {
    integrationMessengerId: string
    templates: readonly MetaMessageTemplateSnapshot[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { tx = db } = input
    for (const template of input.templates) {
      await tx
        .insert(messengerMessageTemplateModel)
        .values({
          id: createId(),
          integrationMessengerId: input.integrationMessengerId,
          sourceId: template.id,
          ...snapshotColumns(template),
        })
        .onConflictDoUpdate({
          target: [
            messengerMessageTemplateModel.integrationMessengerId,
            messengerMessageTemplateModel.sourceId,
          ],
          set: snapshotColumns(template),
        })
    }
  }

  /**
   * A full sync: rows Meta no longer returns for the page are gone, except
   * clone reservations still within their TTL — a clone may be between its
   * reservation and Meta's answer, and deleting the row would let a second
   * clone create the template again.
   */
  async deleteMissingForIntegration(input: {
    integrationMessengerId: string
    keepSourceIds: readonly string[]
    tx?: DatabaseClient
    now?: Date
  }): Promise<void> {
    const { tx = db, now = new Date() } = input
    const existing = await tx
      .select({
        id: messengerMessageTemplateModel.id,
        sourceId: messengerMessageTemplateModel.sourceId,
        createdAt: messengerMessageTemplateModel.createdAt,
      })
      .from(messengerMessageTemplateModel)
      .where(
        eq(
          messengerMessageTemplateModel.integrationMessengerId,
          input.integrationMessengerId,
        ),
      )
    const keep = new Set(input.keepSourceIds)
    const staleSourceIds = existing
      .filter(
        (row) =>
          !(keep.has(row.sourceId) || isActiveCloneReservation(row, now)),
      )
      .map((row) => row.sourceId)
    if (staleSourceIds.length === 0) {
      return
    }
    // Deleted by the sourceId that was seen stale, not by row id: a
    // reservation fulfilled between the select and this delete now carries
    // Meta's id (unique per page) and is left untouched.
    await tx
      .delete(messengerMessageTemplateModel)
      .where(
        and(
          eq(
            messengerMessageTemplateModel.integrationMessengerId,
            input.integrationMessengerId,
          ),
          inArray(messengerMessageTemplateModel.sourceId, staleSourceIds),
        ),
      )
  }
}

export const messengerMessageTemplateService =
  new MessengerMessageTemplateService()
