import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import {
  mediaLibraryFileRepository,
  savedReplyImageRepository,
} from "@chatbotx.io/database/repositories"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import type { BotFieldModel } from "@chatbotx.io/database/types"
import { uploader } from "@chatbotx.io/filesystem"
import { createId, mapWithConcurrency } from "@chatbotx.io/utils"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { customFieldResolutionKey } from "@chatbotx.io/utils/custom-field"
import { z } from "zod"
import { botFieldService } from "../../bot-field/service"
import { logger } from "../../logger"
import { omitKeys } from "../fingerprint"
import { savedReplyImagePrefix } from "../template-object-keys"
import { assertBackupFormat, EMPTY_COLLECT_RESULT, resolveRef } from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
  ResourceSyncHandler,
  StagedObject,
  TemplateInstallContext,
  TemplateStageContext,
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

/** Parallel storage copies per saved reply, to keep staging short. */
const IMAGE_COPY_CONCURRENCY = 4

/** The slot `stage` and `insert` agree on for one saved-reply image. */
const savedReplyImageStageKey = (
  sourceId: string,
  imageIndex: number,
): string => `settings:savedReplies:${sourceId}:${imageIndex}`

/**
 * Copies a saved reply's images to deterministic keys of the installing
 * workspace's media library, before the apply transaction. An image whose
 * source object is gone (or whose path isn't a public media library object)
 * is staged as skipped; `insert` turns that into a warning instead of failing
 * the install.
 */
const stageSavedReplyImages = async (
  ctx: TemplateStageContext,
  entry: TemplateSavedReplyEntry,
  staged: Map<string, StagedObject>,
): Promise<void> => {
  const images = entry.images ?? []
  const copies = await mapWithConcurrency(
    images,
    IMAGE_COPY_CONCURRENCY,
    async (image, imageIndex) => {
      if (!isCopyableImage(image)) {
        return null
      }
      // Deterministic per (installation, saved reply, image slot), so a retried
      // install overwrites the same key instead of orphaning a new copy.
      const targetPath = `${savedReplyImagePrefix(ctx.workspaceId, ctx.installationId, ctx.scope)}${await sha256Hex(`${ctx.installationId}:${entry.sourceId}:${imageIndex}:${image.path}`)}`
      await uploader.copyObject(image.path, targetPath)
      ctx.trackCopiedObject(targetPath)
      return targetPath
    },
  )
  for (const [index, copy] of copies.entries()) {
    const key = savedReplyImageStageKey(entry.sourceId, index)
    if (copy.status === "fulfilled" && copy.value !== null) {
      staged.set(key, { targetPath: copy.value })
      continue
    }
    if (copy.status === "rejected") {
      logger.warn(
        { err: copy.reason },
        "Template install: saved reply image could not be copied",
      )
    }
    staged.set(key, { skipped: "savedReplyImage" })
  }
}

/**
 * Adds the media-library rows for a saved reply's staged images and returns the
 * new file ids, in order. Only rows are written here; the objects were copied
 * before the transaction.
 */
const installSavedReplyImages = async (
  ctx: TemplateInstallContext,
  entry: TemplateSavedReplyEntry,
): Promise<string[]> => {
  const images = entry.images ?? []
  const fileIds: string[] = []
  for (const [index, image] of images.entries()) {
    const staged = ctx.staged?.get(
      savedReplyImageStageKey(entry.sourceId, index),
    )
    if (!staged || "skipped" in staged || !isCopyableImage(image)) {
      ctx.warn({
        category: "settings",
        entityKind: "savedReplyImage",
        path: `settings.savedReplies.${entry.sourceId}.images.${index}`,
        value: String((image as { path?: unknown } | null)?.path ?? ""),
      })
      continue
    }
    const file = await mediaLibraryFileRepository.create(
      {
        id: createId(),
        workspaceId: ctx.workspaceId,
        folderId: null,
        name: image.name,
        path: staged.targetPath,
        mimeType: image.mimeType,
        size: image.size,
      },
      ctx.tx,
    )
    fileIds.push(file.id)
  }
  return fileIds
}

/** The shape `serializeBackup` writes and `restoreBackup` reads. */
const BACKUP_FORMAT_VERSION = 1

/**
 * Fields the installer owns. A bot field's folder is theirs, and a saved
 * reply has none; bot fields are only ever found-or-created (never updated by
 * a sync), so their fingerprint ignores the folder alone.
 */
const SETTINGS_INSTALLER_OWNED_FIELDS = ["folderId"] as const

/** What a template update overwrites on an installed saved reply (its images stay as the installer has them). */
const savedReplyContentSchema = z.object({
  shortcut: z.string(),
  text: z.string(),
})
type SavedReplyContent = z.infer<typeof savedReplyContentSchema>

const readSavedReply = async (
  tx: DatabaseClient,
  resourceId: string,
): Promise<SavedReplyContent | null> => {
  // Locked for the rest of the transaction (see the keywords adapter).
  const [row] = await tx
    .select()
    .from(savedReplyModel)
    .where(eq(savedReplyModel.id, resourceId))
    .for("update")
    .limit(1)
  return row ? { shortcut: row.shortcut, text: row.text } : null
}

type TemplateBotFieldEntry = {
  sourceId: string
  name: string
  type: BotFieldModel["type"]
  value: string | null
  description: string | null
  // Bot fields share the `customField` folder namespace (see
  // `botFieldService.create`'s `folderType: "customField"` scoping), so
  // this resolves against `idMaps.folder`, keyed the same way `customField`
  // folders are in the manifest.
  folderId: string | null
}

/**
 * Finds or creates one bot field and fills `idMaps.botField` for it. Shared by
 * `insertEarly` (an install or sync resolves every bot field BEFORE the
 * categories that carry `{{bot_field:<id>}}` text — questionnaires, products,
 * saved replies, ... — are written) and by `insert`.
 */
const insertBotFieldEntry = async (
  ctx: TemplateInstallContext,
  entry: TemplateBotFieldEntry & { sourceId: string },
): Promise<void> => {
  const folderId = resolveFolderRef(ctx, entry)
  // Held through commit: the name read below and the create stay one step.
  await botFieldService.lockNames(ctx.tx, ctx.workspaceId)
  // A same-typed field the installer already has is reused as is (its value
  // stays theirs). A name held by a field of ANOTHER type is created as
  // `<name>_<n>` (the custom-field rule, one shared planner): creating it
  // under the same name would violate the unique index or make a
  // type-blind `{{name}}` ambiguous. `{{bot_field:<id>}}` tokens are
  // id-remapped, so a rename needs no token rewrite.
  const fieldKey = { name: entry.name, type: entry.type }
  const { plans } = await botFieldService.planResolution({
    workspaceId: ctx.workspaceId,
    fields: [fieldKey],
    tx: ctx.tx,
  })
  const plan = plans.get(customFieldResolutionKey(fieldKey))
  const existing = plan?.action === "reuse" ? plan.row : undefined
  const created =
    existing ??
    (await botFieldService.create({
      workspaceId: ctx.workspaceId,
      data: {
        name: plan && plan.action !== "reuse" ? plan.plannedName : entry.name,
        type: entry.type,
        value: entry.value,
        description: entry.description,
        folderId,
      },
      tx: ctx.tx,
    }))
  if (plan?.action === "rename") {
    ctx.warn({
      category: "settings",
      entityKind: "botFieldRenamed",
      path: `settings.botFields.${entry.sourceId}`,
      value: `${entry.name} -> ${created.name} (${entry.type})`,
    })
  }
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
    wasExisting: Boolean(existing),
  })
}

/** A settings entry: the flattened saved replies and bot fields, told apart by `kind`. */
type TemplateSettingsEntry =
  | (TemplateSavedReplyEntry & { kind: "savedReply" })
  | (TemplateBotFieldEntry & { kind: "botField" })

/** The bot-field entries among a settings category's flattened entries. */
const isBotFieldEntry = (
  entry: Record<string, unknown>,
): entry is TemplateBotFieldEntry & { kind: "botField"; sourceId: string } =>
  entry.kind === "botField"

/**
 * `settings` bundles two unrelated tables (`SavedReply`, `BotField`) under
 * one template category, per the plan's "Settings subset" — `CustomField`/
 * `Tag` participate only via their Phase-R manifests, `SystemField` is
 * excluded entirely (no `workspaceId`, a global table).
 */
export const settingsAdapter: ResourceAdapter<TemplateSettingsEntry> = {
  earlyEntry: isBotFieldEntry,
  async insertEarly(ctx, entries) {
    for (const entry of entries) {
      if (entry.kind === "botField") {
        await insertBotFieldEntry(ctx, entry)
      }
    }
  },

  category: "settings",
  providesKinds: ["botField"],
  consumesKinds: ["folder"],
  deferredKinds: [],
  trackedKind: null,
  folderTypes: ["customField"],
  minFormatVersion: 1,
  fingerprint: {
    project: (entry) =>
      entry.kind === "botField"
        ? omitKeys(entry, SETTINGS_INSTALLER_OWNED_FIELDS)
        : entry,
  },

  async stage(
    ctx: TemplateStageContext,
    entries: readonly TemplateSettingsEntry[],
  ): Promise<Map<string, StagedObject>> {
    const staged = new Map<string, StagedObject>()
    for (const entry of entries) {
      if (entry.kind === "savedReply") {
        await stageSavedReplyImages(ctx, entry, staged)
      }
    }
    return staged
  },

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateSettingsEntry[],
  ): Promise<PatchTask[]> {
    for (const entry of entries) {
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

      await insertBotFieldEntry(ctx, entry)
    }

    return [] satisfies PatchTask[]
  },

  // Saved replies only. A bot field is shared infrastructure, found-or-created
  // through the manifest path: the sync never touches it (and never plans it
  // for an update), so it can not overwrite a value the installer set.
  sync: {
    async project(tx, resourceId) {
      return await readSavedReply(tx, resourceId)
    },

    async serializeBackup(tx, resourceId) {
      const content = await readSavedReply(tx, resourceId)
      return content ? { formatVersion: BACKUP_FORMAT_VERSION, content } : null
    },

    async restoreBackup(tx, resourceId, content, formatVersion) {
      assertBackupFormat(formatVersion, BACKUP_FORMAT_VERSION)
      const parsed = savedReplyContentSchema.safeParse(content)
      if (!parsed.success) {
        throw new Error("The saved reply backup is not in a restorable shape")
      }
      await tx
        .update(savedReplyModel)
        .set(parsed.data)
        .where(eq(savedReplyModel.id, resourceId))
    },

    async update(ctx, pairs) {
      for (const { entry, resourceId } of pairs) {
        if (entry.kind !== "savedReply") {
          continue
        }
        await ctx.tx
          .update(savedReplyModel)
          .set({ shortcut: entry.shortcut, text: entry.text })
          .where(eq(savedReplyModel.id, resourceId))
      }
    },
  } satisfies ResourceSyncHandler<TemplateSettingsEntry>,

  collector: {
    async resolveIds(workspaceId, limit) {
      const [savedReplies, botFields] = await Promise.all([
        db.query.savedReplyModel.findMany({
          where: { workspaceId },
          columns: { id: true },
          limit,
        }),
        db.query.botFieldModel.findMany({
          where: { workspaceId },
          columns: { id: true },
          limit,
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
        return EMPTY_COLLECT_RESULT
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
): string | null =>
  resolveRef(ctx, {
    category: "settings",
    kind: "folder",
    path: `settings.botFields.${entry.sourceId}.folderId`,
    sourceRef: entry.folderId,
  })
