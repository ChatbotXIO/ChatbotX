import { db } from "@chatbotx.io/database/client"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { botFieldService } from "../../bot-field/service"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
  TemplateInstallContext,
} from "./types"

type TemplateSavedReplyEntry = {
  sourceId: string
  shortcut: string
  text: string
}

type TemplateBotFieldEntry = {
  sourceId: string
  name: string
  type: string
  value: string | null
  description: string | null
  // Bot fields share the `customField` folder namespace (see
  // `botFieldService.create`'s `folderType: "customField"` scoping), so
  // this resolves against `idMaps.folder`, keyed the same way `customField`
  // folders are in the manifest.
  folderId: string | null
}

/**
 * `settings` bundles two unrelated tables (`SavedReply`, `BotField`) under
 * one template category, per the plan's "Settings subset" — `CustomField`/
 * `Tag` participate only via their Phase-R manifests, `SystemField` is
 * excluded entirely (no `workspaceId`, a global table).
 */
export const settingsAdapter: ResourceAdapter = {
  category: "settings",
  providesKinds: ["botField"],
  consumesKinds: ["folder"],
  deferredKinds: [],

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly (Record<string, unknown> & { sourceId: string })[],
  ): Promise<PatchTask[]> {
    for (const rawEntry of entries) {
      const entry = rawEntry as unknown as
        | (TemplateSavedReplyEntry & { kind: "savedReply" })
        | (TemplateBotFieldEntry & { kind: "botField" })

      if (entry.kind === "savedReply") {
        const [created] = await ctx.tx
          .insert(savedReplyModel)
          .values({
            id: createId(),
            workspaceId: ctx.workspaceId,
            shortcut: entry.shortcut,
            text: entry.text,
          })
          .returning()
        ctx.track({
          category: "settings",
          resourceKind: "savedReply",
          resourceId: created.id,
          sourceResourceId: entry.sourceId,
          wasExisting: false,
        })
        continue
      }

      const folderId = resolveFolderRef(ctx, entry)
      const created = await botFieldService.create({
        workspaceId: ctx.workspaceId,
        data: {
          name: entry.name,
          type: entry.type as never,
          value: entry.value,
          description: entry.description,
          folderId,
        },
        tx: ctx.tx,
      })
      // `flowsAdapter` (and any other consumer) resolves `bot_field:<id>`
      // tokens against this map — populate it here, the moment the row
      // exists, exactly like every other `providesKinds` entry.
      if (!ctx.idMaps.botField) {
        ctx.idMaps.botField = new Map()
      }
      ctx.idMaps.botField.set(entry.sourceId, created.id)
      ctx.track({
        category: "settings",
        resourceKind: "botField",
        resourceId: created.id,
        sourceResourceId: entry.sourceId,
        wasExisting: false,
      })
    }

    return [] satisfies PatchTask[]
  },

  collector: {
    async resolveIds(workspaceId) {
      const [savedReplies, botFields] = await Promise.all([
        db.query.savedReplyModel.findMany({
          where: { workspaceId },
          columns: { id: true },
        }),
        db.query.botFieldModel.findMany({
          where: { workspaceId },
          columns: { id: true },
        }),
      ])
      return [...savedReplies, ...botFields].map((row) => row.id)
    },

    // `settings` bundles two tables under one category id space — an id may
    // belong to either, so both are checked and their hits combined. Never
    // ambiguous: `SavedReply`/`BotField` ids are workspace-scoped primary
    // keys from disjoint tables, so no id can validly appear in both.
    async verifyOwnership(workspaceId, ids) {
      const uniqueIds = [...new Set(ids)]
      if (uniqueIds.length === 0) {
        return []
      }
      const [savedReplies, botFields] = await Promise.all([
        db.query.savedReplyModel.findMany({
          where: { workspaceId, id: { in: uniqueIds } },
          columns: { id: true },
        }),
        db.query.botFieldModel.findMany({
          where: { workspaceId, id: { in: uniqueIds } },
          columns: { id: true },
        }),
      ])
      return [...savedReplies, ...botFields].map((row) => row.id)
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return {
          entries: [],
          folderIds: [],
          productCategoryIds: [],
          hardDependencies: [],
        }
      }
      const uniqueIds = [...ids]
      const [savedReplies, botFields] = await Promise.all([
        db.query.savedReplyModel.findMany({
          where: { workspaceId, id: { in: uniqueIds } },
        }),
        db.query.botFieldModel.findMany({
          where: { workspaceId, id: { in: uniqueIds } },
        }),
      ])

      const savedReplyEntries = savedReplies.map((row) => ({
        sourceId: row.id,
        kind: "savedReply" as const,
        shortcut: row.shortcut,
        text: row.text,
      }))
      const botFieldEntries = botFields.map((row) => ({
        sourceId: row.id,
        kind: "botField" as const,
        name: row.name,
        type: row.type,
        value: row.value,
        description: row.description,
        folderId: row.folderId,
      }))

      const folderIds = botFields.flatMap((row) =>
        row.folderId ? [row.folderId] : [],
      )

      return {
        entries: [...savedReplyEntries, ...botFieldEntries],
        folderIds,
        productCategoryIds: [],
        hardDependencies: [],
      }
    },
  } satisfies ResourceCollector,
}

const resolveFolderRef = (
  ctx: TemplateInstallContext,
  entry: TemplateBotFieldEntry,
): string | null => {
  if (!entry.folderId) {
    return null
  }
  const targetId = ctx.idMaps.folder?.get(entry.folderId)
  if (!targetId) {
    ctx.warn({
      category: "settings",
      entityKind: "folder",
      path: `settings.botFields.${entry.sourceId}.folderId`,
      value: entry.folderId,
    })
    return null
  }
  return targetId
}
