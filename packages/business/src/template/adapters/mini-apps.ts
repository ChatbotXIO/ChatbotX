import { and, db, eq } from "@chatbotx.io/database/client"
import { miniAppNotPublishedRaw } from "@chatbotx.io/database/repositories"
import { miniAppModel } from "@chatbotx.io/database/schema"
import {
  applyCustomFieldMappings,
  collectCustomFieldMappings,
  type MiniAppDefinition,
  miniAppDefinitionSchema,
  toFlowJson,
} from "@chatbotx.io/mini-app"
import { MINI_APP_COPY_NAME } from "../../mini-app/names"
import { miniAppService } from "../../mini-app/service"
import { createLinkRewritePatcher } from "./link-rewrite-patcher"
import { insertCopyNamed } from "./naming"
import {
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

type TemplateMiniAppEntry = {
  sourceId: string
  name: string
  enabled: boolean
  /** The editor model; the Flow JSON is regenerated from it on insert. */
  definition: MiniAppDefinition
}

/** Only a Mini App with no successful WhatsApp publication can be copied. */
const notPublished = () => ({ RAW: miniAppNotPublishedRaw })

/**
 * What a template does with every column of `MiniApp`. Submissions are a separate table and never travel.
 */
export const MINI_APP_COLUMNS = {
  id: "reset",
  createdAt: "reset",
  updatedAt: "reset",
  workspaceId: "reset",
  // Made unique per workspace.
  name: "copy",
  enabled: "copy",
  // Custom-field ids are rebound; links follow the copies.
  definition: "reference",
  // Generated again from the rebound definition.
  flowJson: "reset",
  submissionsCount: "reset",
} as const satisfies Record<
  keyof typeof miniAppModel.$inferSelect,
  "copy" | "reset" | "drop" | "rebind" | "reference"
>

/**
 * A Mini App is copied with its screens and its custom-field mappings (rebound
 * to the installer's fields; an unresolved mapping is cleared with a warning).
 * Submissions, uploads and publications never travel, and one that is already
 * published to WhatsApp is not offered at all: its Flow lives on the creator's
 * WhatsApp number. The Flow JSON is regenerated from the definition.
 */
export const miniAppsAdapter: ResourceAdapter<TemplateMiniAppEntry> = {
  category: "miniApps",
  providesKinds: ["miniApp"],
  consumesKinds: ["customField"],
  deferredKinds: [],
  trackedKind: "miniApp",
  folderTypes: [],
  // A screen can link to a tool installed after it (or to the Mini App itself).
  rewritesLinksInPatch: true,
  minFormatVersion: 3,
  sync: updateNotSupported("miniApps"),

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateMiniAppEntry[],
  ): Promise<PatchTask[]> {
    const patcher = createLinkRewritePatcher<MiniAppDefinition>("miniApps")
    for (const entry of entries) {
      const mappings = Object.fromEntries(
        Object.entries(collectCustomFieldMappings(entry.definition)).map(
          ([inputName, fieldId]) => [
            inputName,
            resolveRef(ctx, {
              category: "miniApps",
              kind: "customField",
              path: `miniApps.${entry.sourceId}.definition.${inputName}`,
              sourceRef: fieldId,
            }),
          ],
        ),
      )
      const definition = miniAppDefinitionSchema.parse(
        applyCustomFieldMappings(entry.definition, mappings),
      )
      const created = await insertCopyNamed(ctx, {
        category: "miniApps",
        constraint: "MiniApp_workspaceId_name_key",
        entry,
        nameRules: MINI_APP_COPY_NAME,
        findTaken: (tx, name) =>
          tx.query.miniAppModel.findMany({
            where: { workspaceId: ctx.workspaceId, name },
            columns: { name: true },
          }),
        insert: (tx, name) =>
          miniAppService.insertInTx(tx, {
            workspaceId: ctx.workspaceId,
            name,
            enabled: entry.enabled,
            definition,
          }),
      })
      if (!created) {
        continue
      }
      recordCopy(ctx, {
        category: "miniApps",
        resourceKind: "miniApp",
        idMapKind: "miniApp",
        sourceId: entry.sourceId,
        resourceId: created.id,
      })
      patcher.defer({
        sourceId: entry.sourceId,
        original: definition,
        // The Flow JSON is generated from the definition, so it follows.
        write: async (tx, linked, patchCtx) => {
          await tx
            .update(miniAppModel)
            .set({
              definition: miniAppDefinitionSchema.parse(linked),
              flowJson: toFlowJson(linked),
            })
            .where(
              and(
                eq(miniAppModel.id, created.id),
                eq(miniAppModel.workspaceId, patchCtx.workspaceId),
              ),
            )
        },
      })
    }
    return patcher.tasks()
  },

  collector: makeCollector({
    findIds: (query) =>
      db.query.miniAppModel.findMany({
        where: scopedWhere(query, notPublished()),
        columns: { id: true },
        limit: query.limit,
      }),

    async collectRows(workspaceId, ids) {
      const rows = await db.query.miniAppModel.findMany({
        where: scopedWhere({ workspaceId, ids }, notPublished()),
      })
      return {
        entries: rows.map(
          (row): TemplateMiniAppEntry => ({
            sourceId: row.id,
            name: row.name,
            enabled: row.enabled,
            definition: row.definition,
          }),
        ),
      }
    },
  }),
}
