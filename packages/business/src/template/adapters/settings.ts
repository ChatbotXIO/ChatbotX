import { savedReplyModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { botFieldService } from "../../bot-field/service"
import type {
  PatchTask,
  ResourceAdapter,
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
  providesKinds: [],
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
