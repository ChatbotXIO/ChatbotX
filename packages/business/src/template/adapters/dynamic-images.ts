import { and, db, eq } from "@chatbotx.io/database/client"
import {
  type DynamicImageDocument,
  dynamicImageDocument,
} from "@chatbotx.io/database/partials"
import { dynamicImageStaleBackgroundRepository } from "@chatbotx.io/database/repositories"
import { dynamicImageModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { dynamicImageService } from "../../dynamic-image/service"
import { logger } from "../../logger"
import { rewriteBotFieldTokensDeep } from "../field-token-binder"
import { bakedLayerChanged } from "./dynamic-image-static-links"
import { createLinkRewritePatcher } from "./link-rewrite-patcher"
import { insertCopyNamed } from "./naming"
import {
  makeCollector,
  recordCopy,
  resolveRef,
  scopedWhere,
  updateNotSupported,
} from "./shared"
import {
  resolveToolImageUrl,
  stageToolImages,
  type ToolImageSlot,
} from "./staging"
import type {
  AfterCommitTask,
  PatchTask,
  ResourceAdapter,
  StagedObject,
  TemplateInstallContext,
  TemplateStageContext,
} from "./types"

type TemplateDynamicImageEntry = {
  sourceId: string
  name: string
  enabled: boolean
  /** The canvas and its layers; field ids and image URLs inside are rebound at install. */
  data: DynamicImageDocument
  /** Storage key of the rendered static background in the source workspace. */
  backgroundUrl: string | null
  /** The source custom field that caches each contact's rendered image. */
  customFieldId: string | null
}

const DYNAMIC_IMAGE_SKIPPED = "dynamicImage"
const DYNAMIC_IMAGE_NAME_MAX_LENGTH = 100
const BACKGROUND_VERSION = /background_(\d+)\.png$/

/** A bare storage key as the URL form `parseCopyableImageUrl` understands. */
const asStorageUrl = (key: string): string => `/${key}`

const backgroundSlot = (entry: TemplateDynamicImageEntry): ToolImageSlot[] =>
  entry.backgroundUrl
    ? [
        {
          stageKey: `dynamicImages:${entry.sourceId}:background`,
          url: asStorageUrl(entry.backgroundUrl),
          // Keeps the `background_<version>.png` tail the service parses for cache tagging.
          targetSuffix: `-background_${BACKGROUND_VERSION.exec(entry.backgroundUrl)?.[1] ?? "0"}.png`,
        },
      ]
    : []

/** The element images worth copying: a fixed image or a QR logo (never per-contact sources). */
const elementImageSlots = (entry: TemplateDynamicImageEntry): ToolImageSlot[] =>
  entry.data.elements.flatMap((element) => {
    if (
      element.type === "image" &&
      element.imageType === "url" &&
      element.url
    ) {
      return [
        {
          stageKey: `dynamicImages:${entry.sourceId}:element:${element.id}`,
          url: element.url,
        },
      ]
    }
    if (element.type === "qrCode" && element.logoUrl) {
      return [
        {
          stageKey: `dynamicImages:${entry.sourceId}:element:${element.id}`,
          url: element.logoUrl,
        },
      ]
    }
    return []
  })

const imageSlots = (entry: TemplateDynamicImageEntry): ToolImageSlot[] => [
  ...backgroundSlot(entry),
  ...elementImageSlots(entry),
]

/**
 * The layers with every id and image rebound to this workspace: a custom field
 * through the manifest (an unresolved one is dropped with a warning), a fixed
 * image or QR logo to its staged copy.
 */
const rebindElements = (
  ctx: TemplateInstallContext,
  entry: TemplateDynamicImageEntry,
): DynamicImageDocument => ({
  ...entry.data,
  elements: entry.data.elements.map((element) => {
    const path = `dynamicImages.${entry.sourceId}.data.elements.${element.id}`
    const stageKey = `dynamicImages:${entry.sourceId}:element:${element.id}`
    if (element.type === "image") {
      const customFieldId = element.customFieldId
        ? (resolveRef(ctx, {
            category: "dynamicImages",
            kind: "customField",
            path: `${path}.customFieldId`,
            sourceRef: element.customFieldId,
          }) ?? undefined)
        : undefined
      const url =
        element.imageType === "url" && element.url
          ? resolveToolImageUrl(ctx, {
              stageKey,
              url: element.url,
              category: "dynamicImages",
              skippedKind: DYNAMIC_IMAGE_SKIPPED,
              path: `${path}.url`,
            })
          : element.url
      return { ...element, customFieldId, url }
    }
    if (element.type === "qrCode" && element.logoUrl) {
      return {
        ...element,
        logoUrl: resolveToolImageUrl(ctx, {
          stageKey,
          url: element.logoUrl,
          category: "dynamicImages",
          skippedKind: DYNAMIC_IMAGE_SKIPPED,
          path: `${path}.logoUrl`,
        }),
      }
    }
    return element
  }),
})

/**
 * The post-commit re-bake of a copy's background from its rewritten document.
 * A failure leaves the copy switched off (see `write`) and is reported to the
 * installer, so the creator's QR is never served silently.
 */
const rerenderTask =
  (input: {
    workspaceId: string
    id: string
    enabled: boolean
    sourceId: string
    backgroundUrl: string | null
  }): AfterCommitTask =>
  async () => {
    try {
      await dynamicImageService.rerenderInstalledBackground(input)
      return
    } catch (error) {
      logger.error(
        { err: error, dynamicImageId: input.id },
        "template: re-rendering a dynamic image background failed",
      )
      return {
        category: "dynamicImages",
        entityKind: "dynamicImageRerenderFailed",
        path: `dynamicImages.${input.sourceId}.backgroundUrl`,
        value: input.backgroundUrl ?? "",
      }
    }
  }

/**
 * The per-contact cache field. A field the installer already had is theirs:
 * editing or deleting the image clears that field's value for every contact,
 * so it is never claimed. The image installs unbound for them to choose one.
 */
const resolveCacheField = (
  ctx: TemplateInstallContext,
  entry: TemplateDynamicImageEntry,
): string | null => {
  const fieldId = resolveRef(ctx, {
    category: "dynamicImages",
    kind: "customField",
    path: `dynamicImages.${entry.sourceId}.customFieldId`,
    sourceRef: entry.customFieldId,
  })
  if (fieldId && ctx.reusedCustomFieldIds?.has(fieldId)) {
    ctx.warn({
      category: "dynamicImages",
      entityKind: "dynamicImageFieldNotBound",
      path: `dynamicImages.${entry.sourceId}.customFieldId`,
      value: entry.customFieldId ?? "",
    })
    return null
  }
  return fieldId
}

/**
 * What a template does with every column of `DynamicImage`. The rendered cache never travels.
 */
export const DYNAMIC_IMAGE_COLUMNS = {
  id: "reset",
  createdAt: "reset",
  updatedAt: "reset",
  workspaceId: "reset",
  // Made unique per workspace.
  name: "copy",
  // The installer's cache field, found or created.
  customFieldId: "reference",
  // Element tokens and links are rebound; re-rendered when they change.
  data: "reference",
  // Staged into the installer's storage.
  backgroundUrl: "copy",
  // Frozen off until a changed document is re-rendered.
  enabled: "copy",
} as const satisfies Record<
  keyof typeof dynamicImageModel.$inferSelect,
  "copy" | "reset" | "drop" | "rebind" | "reference"
>

/**
 * A dynamic image ships its canvas (layers, fonts, colours) and its enabled
 * flag; the images rendered for contacts never do. The static background is
 * copied at stage time (its pixels are the same, being rendered from `data`).
 */
export const dynamicImagesAdapter: ResourceAdapter<TemplateDynamicImageEntry> =
  {
    category: "dynamicImages",
    providesKinds: ["dynamicImage"],
    consumesKinds: ["customField"],
    deferredKinds: [],
    trackedKind: "dynamicImage",
    folderTypes: [],
    // A QR layer can link to a tool installed after it (or to the image itself).
    rewritesLinksInPatch: true,
    minFormatVersion: 3,
    sync: updateNotSupported("dynamicImages"),

    async stage(
      ctx: TemplateStageContext,
      entries: readonly TemplateDynamicImageEntry[],
    ): Promise<Map<string, StagedObject>> {
      return await stageToolImages(
        ctx,
        entries.flatMap(imageSlots),
        DYNAMIC_IMAGE_SKIPPED,
      )
    },

    async insert(
      ctx: TemplateInstallContext,
      entries: readonly TemplateDynamicImageEntry[],
    ): Promise<PatchTask[]> {
      // Links follow the copies once every tool exists, `{{bot_field:<id>}}`
      // once the Account Fields do.
      const patcher =
        createLinkRewritePatcher<DynamicImageDocument>("dynamicImages")
      for (const entry of entries) {
        const [background] = backgroundSlot(entry)
        const staged = background
          ? ctx.staged?.get(background.stageKey)
          : undefined
        if (!staged || "skipped" in staged) {
          // Without its background the image cannot render for anyone.
          ctx.warn({
            category: "dynamicImages",
            entityKind: DYNAMIC_IMAGE_SKIPPED,
            path: `dynamicImages.${entry.sourceId}.backgroundUrl`,
            value: entry.backgroundUrl ?? "",
          })
          continue
        }
        const data = dynamicImageDocument.parse(rebindElements(ctx, entry))
        const customFieldId = resolveCacheField(ctx, entry)
        const created = await insertCopyNamed(ctx, {
          category: "dynamicImages",
          constraint: "DynamicImage_workspaceId_name_key",
          entry,
          // The API and the editor accept at most 100 characters.
          nameRules: {
            style: "dash",
            maxLength: DYNAMIC_IMAGE_NAME_MAX_LENGTH,
          },
          findTaken: (tx, name) =>
            tx.query.dynamicImageModel.findMany({
              where: { workspaceId: ctx.workspaceId, name },
              columns: { name: true },
            }),
          insert: (tx, name) =>
            dynamicImageService.insertInTx(tx, {
              id: createId(),
              workspaceId: ctx.workspaceId,
              name,
              customFieldId,
              data,
              backgroundUrl: staged.targetPath,
              enabled: entry.enabled,
            }),
        })
        if (!created) {
          continue
        }
        recordCopy(ctx, {
          category: "dynamicImages",
          resourceKind: "dynamicImage",
          idMapKind: "dynamicImage",
          sourceId: entry.sourceId,
          resourceId: created.id,
        })
        patcher.defer({
          sourceId: entry.sourceId,
          original: data,
          finish: (linked, patchCtx) =>
            rewriteBotFieldTokensDeep(linked, patchCtx.idMaps.botField),
          write: async (tx, value, patchCtx) => {
            // A baked QR/text layer that followed a copy is still the
            // creator's in the stored background: switch the image off until
            // it is rendered again after the commit (a crash in between then
            // leaves it off, never serving the creator's link).
            const rerender =
              Boolean(patchCtx.afterCommit) && bakedLayerChanged(data, value)
            await tx
              .update(dynamicImageModel)
              .set(rerender ? { data: value, enabled: false } : { data: value })
              .where(
                and(
                  eq(dynamicImageModel.id, created.id),
                  eq(dynamicImageModel.workspaceId, patchCtx.workspaceId),
                ),
              )
            if (rerender) {
              // Durable with the freeze: a crash before the re-render leaves
              // the copy marked, so turning it on renders it first.
              await dynamicImageStaleBackgroundRepository.mark(
                { workspaceId: patchCtx.workspaceId, resourceId: created.id },
                tx,
              )
              patchCtx.afterCommit?.(
                rerenderTask({
                  workspaceId: patchCtx.workspaceId,
                  id: created.id,
                  enabled: entry.enabled,
                  sourceId: entry.sourceId,
                  backgroundUrl: entry.backgroundUrl,
                }),
              )
            }
          },
        })
      }
      return patcher.tasks()
    },

    collector: makeCollector({
      findIds: (query) =>
        db.query.dynamicImageModel.findMany({
          where: scopedWhere(query),
          columns: { id: true },
          limit: query.limit,
        }),

      async collectRows(workspaceId, ids) {
        const rows = await db.query.dynamicImageModel.findMany({
          where: scopedWhere({ workspaceId, ids }),
        })
        return {
          entries: rows.map(
            (row): TemplateDynamicImageEntry => ({
              sourceId: row.id,
              name: row.name,
              enabled: row.enabled,
              data: row.data,
              backgroundUrl: row.backgroundUrl,
              customFieldId: row.customFieldId,
            }),
          ),
        }
      },
    }),
  }
