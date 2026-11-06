import { db } from "@chatbotx.io/database/client"
import type { QrStyles, ReflinkType } from "@chatbotx.io/database/partials"
import { reflinkModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { insertCopyNamed } from "./naming"
import {
  dependenciesOn,
  makeCollector,
  recordCopy,
  resolveRef,
  scopedWhere,
  updateNotSupported,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  TemplateInstallContext,
} from "./types"

type TemplateEntryPointLinkEntry = {
  sourceId: string
  name: string
  type: ReflinkType
  // NOT NULL on the row. Per the save-time snapshot rule, any flow a Reflink
  // points at is auto-included in `resources.flows`, so by the time
  // entryPointLinks insert (after flows, in Phase 1) this is always
  // resolvable — an unresolved case is a save-time bug, not an expected
  // runtime path, but is still warned + skipped rather than throwing and
  // aborting the whole install.
  flowId: string
  customFieldId: string | null
  qrStyles: QrStyles | null
}

/**
 * `Reflink(workspaceId, name)` is a real unique constraint, so a name
 * collision with an existing entry-point link in the target workspace is
 * handled via the shared copy-name scheme (`<name> - Copy`) rather than a
 * TOCTOU-racy pre-check.
 */
export const entryPointLinksAdapter: ResourceAdapter<TemplateEntryPointLinkEntry> =
  {
    category: "entryPointLinks",
    providesKinds: [],
    consumesKinds: ["flow", "customField"],
    deferredKinds: [],
    trackedKind: "reflink",
    folderTypes: [],
    minFormatVersion: 1,
    sync: updateNotSupported("entryPointLinks"),

    async insert(
      ctx: TemplateInstallContext,
      entries: readonly TemplateEntryPointLinkEntry[],
    ): Promise<PatchTask[]> {
      for (const entry of entries) {
        const flowId = resolveRef(ctx, {
          category: "entryPointLinks",
          kind: "flow",
          path: `entryPointLinks.${entry.sourceId}.flowId`,
          sourceRef: entry.flowId,
        })
        if (!flowId) {
          continue
        }
        const customFieldId = resolveCustomFieldRef(ctx, entry)

        const created = await insertCopyNamed(ctx, {
          category: "entryPointLinks",
          constraint: "Reflink_workspaceId_name_key",
          entry,
          findTaken: (tx, name) =>
            tx.query.reflinkModel.findMany({
              where: { workspaceId: ctx.workspaceId, name },
              columns: { name: true },
            }),
          insert: (tx, name) =>
            tx
              .insert(reflinkModel)
              .values({
                id: createId(),
                workspaceId: ctx.workspaceId,
                name,
                type: entry.type,
                flowId,
                customFieldId,
                qrStyles: entry.qrStyles,
              })
              .returning()
              .then(([row]) => row),
        })
        if (!created) {
          continue
        }

        recordCopy(ctx, {
          category: "entryPointLinks",
          resourceKind: "reflink",
          sourceId: entry.sourceId,
          resourceId: created.id,
        })
      }

      return [] satisfies PatchTask[]
    },

    collector: makeCollector({
      findIds: (query) =>
        db.query.reflinkModel.findMany({
          where: scopedWhere(query),
          columns: { id: true },
          limit: query.limit,
        }),

      async collectRows(workspaceId, ids) {
        const rows = await db.query.reflinkModel.findMany({
          where: scopedWhere({ workspaceId, ids }),
        })
        const entries = rows.map((row) => ({
          sourceId: row.id,
          name: row.name,
          type: row.type,
          flowId: row.flowId,
          customFieldId: row.customFieldId,
          qrStyles: row.qrStyles,
        }))
        // `flowId` is NOT NULL on `Reflink` — per the save-time snapshot rule
        // this adapter's `insert` depends on, every pointed-at flow must be
        // auto-included in `resources.flows` even when the export UI never
        // explicitly selected it (this is the G9 fix: previously nothing
        // enforced that rule, so a Reflink to an unselected flow would install
        // with a silently dropped flowId).
        return {
          entries,
          hardDependencies: dependenciesOn(
            "flows",
            rows.map((row) => row.flowId),
          ),
        }
      },
    }),
  }

const resolveCustomFieldRef = (
  ctx: TemplateInstallContext,
  entry: TemplateEntryPointLinkEntry,
): string | null =>
  resolveRef(ctx, {
    category: "entryPointLinks",
    kind: "customField",
    path: `entryPointLinks.${entry.sourceId}.customFieldId`,
    sourceRef: entry.customFieldId,
  })
