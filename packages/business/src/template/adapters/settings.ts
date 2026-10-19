import { db } from "@chatbotx.io/database/client"
import {
  mediaLibraryFileRepository,
  savedReplyImageRepository,
} from "@chatbotx.io/database/repositories"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import { uploader } from "@chatbotx.io/filesystem"
import { createId, mapWithConcurrency } from "@chatbotx.io/utils"
import { botFieldService } from "../../bot-field/service"
import { logger } from "../../logger"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
  TemplateInstallContext,
} from "./types"

type TemplateSavedReplyImage = {
  path: string
  name: string
  mimeType: string
  size: number
}

type TemplateSavedReplyEntry = {
  sourceId: string
  shortcut: string
  text: string
  // Absent on templates saved before saved replies carried images.
  images?: TemplateSavedReplyImage[]
}

/**
 * Only public media library objects may be copied into the installing
 * workspace. The template payload is data, so a path outside that prefix
 * (another workspace's private object) is never read.
 */
const COPYABLE_IMAGE_PATH = /^public\/space\/\d+\/media-library\/[^/].*$/

const isCopyableImage = (image: unknown): image is TemplateSavedReplyImage => {
  if (typeof image !== "object" || image === null) {
    return false
  }
  const candidate = image as Partial<TemplateSavedReplyImage>
  return (
    typeof candidate.path === "string" &&
    COPYABLE_IMAGE_PATH.test(candidate.path) &&
    !candidate.path.includes("..") &&
    typeof candidate.name === "string" &&
    typeof candidate.mimeType === "string" &&
    candidate.mimeType.startsWith("image/") &&
    typeof candidate.size === "number"
  )
}

/** Parallel storage copies per saved reply, to keep the install tx short. */
const IMAGE_COPY_CONCURRENCY = 4

/**
 * Copies a saved reply's images into the installing workspace's media
 * library and returns the new file ids, in order. An image whose source
 * object is gone (or whose path isn't a public media library object) is
 * skipped with a warning instead of failing the install.
 */
const installSavedReplyImages = async (
  ctx: TemplateInstallContext,
  entry: TemplateSavedReplyEntry,
): Promise<string[]> => {
  const images = entry.images ?? []
  const copies = await mapWithConcurrency(
    images,
    IMAGE_COPY_CONCURRENCY,
    async (image) => {
      if (!isCopyableImage(image)) {
        return null
      }
      const targetPath = `public/space/${ctx.workspaceId}/media-library/${createId()}`
      await uploader.copyObject(image.path, targetPath)
      ctx.trackCopiedObject?.(targetPath)
      return { image, targetPath }
    },
  )

  const fileIds: string[] = []
  for (const [index, copy] of copies.entries()) {
    const source = images[index] as unknown
    if (copy.status === "rejected" || copy.value === null) {
      if (copy.status === "rejected") {
        logger.warn(
          { err: copy.reason },
          "Template install: saved reply image could not be copied",
        )
      }
      ctx.warn({
        category: "settings",
        entityKind: "savedReplyImage",
        path: `settings.savedReplies.${entry.sourceId}.images.${index}`,
        value: String((source as { path?: unknown } | null)?.path ?? ""),
      })
      continue
    }

    const { image, targetPath } = copy.value
    const file = await mediaLibraryFileRepository.create(
      {
        id: createId(),
        workspaceId: ctx.workspaceId,
        folderId: null,
        name: image.name,
        path: targetPath,
        mimeType: image.mimeType,
        size: image.size,
      },
      ctx.tx,
    )
    fileIds.push(file.id)
  }
  return fileIds
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
        const imageFileIds = await installSavedReplyImages(ctx, entry)
        // An image-only reply that lost every image would install empty,
        // which a saved reply may never be — skip it with a warning.
        if (!entry.text?.trim() && imageFileIds.length === 0) {
          ctx.warn({
            category: "settings",
            entityKind: "savedReply",
            path: `settings.savedReplies.${entry.sourceId}`,
            value: entry.shortcut,
          })
          continue
        }

        const [created] = await ctx.tx
          .insert(savedReplyModel)
          .values({
            id: createId(),
            workspaceId: ctx.workspaceId,
            shortcut: entry.shortcut,
            text: entry.text,
          })
          .returning()
        await savedReplyImageRepository.replaceForSavedReply(
          {
            workspaceId: ctx.workspaceId,
            savedReplyId: created.id,
            mediaLibraryFileIds: imageFileIds,
          },
          ctx.tx,
        )
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
      const savedReplyImages =
        await savedReplyImageRepository.listBySavedReplyIds({
          workspaceId,
          savedReplyIds: savedReplies.map((row) => row.id),
        })

      const savedReplyEntries = savedReplies.map((row) => ({
        sourceId: row.id,
        kind: "savedReply" as const,
        shortcut: row.shortcut,
        text: row.text,
        images: savedReplyImages
          .filter((image) => image.savedReplyId === row.id)
          .map(
            (image): TemplateSavedReplyImage => ({
              path: image.file.path,
              name: image.file.name,
              mimeType: image.file.mimeType,
              size: image.file.size,
            }),
          ),
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
