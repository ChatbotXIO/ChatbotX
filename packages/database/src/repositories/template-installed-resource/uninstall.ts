import { and, type DatabaseClient, db, eq, inArray, sql } from "../../client"
import {
  TEMPLATE_UNINSTALL_DOOMED,
  type TemplateResourceKind,
} from "../../partials/template"
import {
  adsConversionRuleModel,
  automatedResponseModel,
  broadcastModel,
  conditionModel,
  triggerModel,
  webhookModel,
} from "../../schema"

const valueMentions = (value: unknown, ids: ReadonlySet<string>): string[] => {
  if (typeof value === "string" || typeof value === "number") {
    return ids.has(String(value)) ? [String(value)] : []
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => valueMentions(entry, ids))
  }
  return []
}

/**
 * Reads and writes only the template uninstall needs, kept apart from the
 * guard repository (which deliberately has no schema imports).
 */
const toKeywordType = (type: string): "inbound" | "outbound" =>
  type === "outbound" ? "outbound" : "inbound"

export const templateUninstallRepository = {
  /**
   * Locks the keyword rows (`FOR UPDATE`) and returns each one's `type`.
   * A concurrent edit of a locked row waits for the uninstall to commit and
   * then updates 0 rows (deleted) or lands on a detached copy (kept), so an
   * edit can never slip between the "unmodified?" hash check and the delete.
   */
  async lockKeywords(
    input: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<Map<string, "inbound" | "outbound">> {
    if (input.ids.length === 0) {
      return new Map()
    }
    const rows = await tx
      .select({
        id: automatedResponseModel.id,
        type: automatedResponseModel.type,
      })
      .from(automatedResponseModel)
      .where(
        and(
          eq(automatedResponseModel.workspaceId, input.workspaceId),
          inArray(automatedResponseModel.id, input.ids),
        ),
      )
      .for("update")
    return new Map(
      rows.map((row) => [row.id, toKeywordType(row.type)] as const),
    )
  },

  /**
   * The keyword ids, among `ids`, that something else still points at: a
   * `keywordsReceived` contact-filter condition (trigger / webhook conditions
   * and broadcast audiences) or an ads conversion rule's `keywordMatched`
   * trigger. Three batched queries however many ids are probed. The broadcast
   * probe is a text match, so it may over-keep, never under-keep.
   */
  async findReferencedKeywordIds(
    input: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<Set<string>> {
    const wanted = new Set(input.ids)
    const referenced = new Set<string>()
    if (wanted.size === 0) {
      return referenced
    }
    const conditions = await tx
      .select({ value: conditionModel.value })
      .from(conditionModel)
      .leftJoin(triggerModel, eq(triggerModel.id, conditionModel.triggerId))
      .leftJoin(webhookModel, eq(webhookModel.id, conditionModel.webhookId))
      .where(
        and(
          eq(conditionModel.type, "keywordsReceived"),
          sql`(${triggerModel.workspaceId} = ${input.workspaceId} OR ${webhookModel.workspaceId} = ${input.workspaceId})`,
        ),
      )
    for (const row of conditions) {
      for (const id of valueMentions(row.value, wanted)) {
        referenced.add(id)
      }
    }

    const broadcasts = await tx
      .select({ filter: broadcastModel.contactFilter })
      .from(broadcastModel)
      .where(
        and(
          eq(broadcastModel.workspaceId, input.workspaceId),
          sql`${broadcastModel.deletedAt} IS NULL`,
          sql`${broadcastModel.contactFilter}::text LIKE '%keywordsReceived%'`,
        ),
      )
    for (const row of broadcasts) {
      const text = JSON.stringify(row.filter)
      for (const id of wanted) {
        if (text.includes(`"${id}"`)) {
          referenced.add(id)
        }
      }
    }

    const rules = await tx
      .select({ trigger: adsConversionRuleModel.trigger })
      .from(adsConversionRuleModel)
      .where(
        and(
          eq(adsConversionRuleModel.workspaceId, input.workspaceId),
          sql`${adsConversionRuleModel.trigger}->>'type' = 'keywordMatched'`,
        ),
      )
    for (const row of rules) {
      if (row.trigger.type === "keywordMatched") {
        for (const id of valueMentions(
          row.trigger.automatedResponseIds,
          wanted,
        )) {
          referenced.add(id)
        }
      }
    }
    return referenced
  },

  /**
   * The ids, among `resourceIds`, that an uninstall has tombstoned
   * (`deleting*`, or `failed*` awaiting a retry) and not yet removed: new edits, toggles
   * and inbound references to them are rejected. Index-served by the
   * `active_lookup` partial index.
   */
  async findTombstoned(
    input: {
      workspaceId: string
      resourceKind: TemplateResourceKind
      resourceIds: readonly string[]
    },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    if (input.resourceIds.length === 0) {
      return []
    }
    const rows = await tx.query.templateInstalledResourceModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        resourceKind: input.resourceKind,
        resourceId: { in: [...input.resourceIds] },
        wasExisting: false,
        detachedAt: { isNull: true as const },
        // Failed rows are still doomed: a retry deletes them without asking again.
        uninstallOutcome: { in: [...TEMPLATE_UNINSTALL_DOOMED] },
      },
      columns: { resourceId: true },
    })
    return rows.map((row) => row.resourceId)
  },

  /** Deletes keywords of one `type` (read from the locked row), inside the caller's transaction. */
  async deleteKeywords(
    input: { workspaceId: string; ids: string[]; type: "inbound" | "outbound" },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await tx
      .delete(automatedResponseModel)
      .where(
        and(
          eq(automatedResponseModel.workspaceId, input.workspaceId),
          inArray(automatedResponseModel.id, input.ids),
          eq(automatedResponseModel.type, input.type),
        ),
      )
  },

  /**
   * The ids, among `resourceIds`, that an installation OTHER than the ones
   * being uninstalled still locks against deletion (`allowDelete = false`):
   * the same rule as `findBlocking`, minus the uninstall's own installations.
   */
  async findDeleteBlockedByOthers(
    input: {
      workspaceId: string
      resourceKind: TemplateResourceKind
      resourceIds: readonly string[]
      excludeInstallationIds: readonly string[]
    },
    tx: DatabaseClient = db,
  ): Promise<Set<string>> {
    if (input.resourceIds.length === 0) {
      return new Set()
    }
    const rows = await tx.query.templateInstalledResourceModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        resourceKind: input.resourceKind,
        resourceId: { in: [...input.resourceIds] },
        installationId: { notIn: [...input.excludeInstallationIds] },
        wasExisting: false,
        detachedAt: { isNull: true as const },
        allowDelete: false,
        installation: {
          sourceDeletedAt: { isNull: true as const },
          templateId: { isNotNull: true as const },
        },
      },
      columns: { resourceId: true },
    })
    return new Set(rows.map((row) => row.resourceId))
  },
}
