import { uploader } from "@chatbotx.io/filesystem"
import { mapWithConcurrency } from "@chatbotx.io/utils"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { logger } from "../../logger"
import { toolImagePrefix } from "../template-object-keys"
import { warnStagedSkip } from "./shared"
import type {
  StagedObject,
  TemplateInstallContext,
  TemplateStageContext,
} from "./types"

const QUERY_OR_HASH = /[?#]/

/** Parallel storage copies per category, to keep staging short. */
const IMAGE_COPY_CONCURRENCY = 4

/**
 * Splits the URL of an image that lives in the publishing workspace's public
 * storage into the object path and the URL prefix before it. Only that prefix
 * is ever copied: the worker copies with its own privileges, so a path into any
 * other workspace (or an external link) is never followed.
 */
export const parseCopyableImageUrl = (
  url: string,
  sourceWorkspaceId: string | undefined,
): { path: string; base: string } | null => {
  if (!sourceWorkspaceId) {
    return null
  }
  const marker = `/public/space/${sourceWorkspaceId}/`
  const at = url.indexOf(marker)
  if (at < 0) {
    return null
  }
  const path = url.slice(at + 1).split(QUERY_OR_HASH)[0] ?? ""
  if (path.includes("..") || path.length <= marker.length - 1) {
    return null
  }
  return { path, base: url.slice(0, at + 1) }
}

/** One image slot of an entry: where `stage` stores its outcome and `insert` reads it back. */
export type ToolImageSlot = {
  /** Unique within the install, e.g. `polls:<sourceId>:candidate:2`. */
  stageKey: string
  url: string
  /** Appended to the staged key (e.g. a file name a reader parses); none by default. */
  targetSuffix?: string
}

/**
 * Copies every slot whose URL lives in the publishing workspace's public
 * storage to a deterministic key of the installing workspace (before the apply
 * transaction opens), so deleting the source later cannot break the copy.
 * An image that could not be copied is reported as skipped under `skippedKind`.
 */
export const stageToolImages = async (
  ctx: TemplateStageContext,
  slots: readonly ToolImageSlot[],
  skippedKind: string,
): Promise<Map<string, StagedObject>> => {
  const staged = new Map<string, StagedObject>()
  const jobs = slots.flatMap((slot) => {
    const parsed = parseCopyableImageUrl(slot.url, ctx.sourceWorkspaceId)
    return parsed ? [{ slot, path: parsed.path }] : []
  })
  const prefix = toolImagePrefix(ctx.workspaceId, ctx.installationId, ctx.scope)
  const copies = await mapWithConcurrency(
    jobs,
    IMAGE_COPY_CONCURRENCY,
    async ({ slot, path }) => {
      const targetPath = `${prefix}${await sha256Hex(`${slot.stageKey}:${path}`)}${slot.targetSuffix ?? ""}`
      await uploader.copyObject(path, targetPath)
      ctx.trackCopiedObject(targetPath)
      return targetPath
    },
  )
  for (const [position, copy] of copies.entries()) {
    const { stageKey } = jobs[position].slot
    if (copy.status === "fulfilled") {
      staged.set(stageKey, { targetPath: copy.value })
      continue
    }
    logger.warn(
      { err: copy.reason, stageKey },
      "Template install: image could not be copied",
    )
    staged.set(stageKey, { skipped: skippedKind })
  }
  return staged
}

/**
 * What `insert` writes for an image slot: the staged copy's URL; the original
 * link when it is external (nothing to copy); or, when the copy failed, the
 * original link kept with a warning rather than losing the image.
 */
export const resolveToolImageUrl = (
  ctx: TemplateInstallContext,
  input: ToolImageSlot & {
    category: Parameters<typeof warnStagedSkip>[1]["category"]
    skippedKind: string
    path: string
  },
): string => {
  const parsed = parseCopyableImageUrl(input.url, ctx.sourceWorkspaceId)
  if (!parsed) {
    return input.url
  }
  const staged = ctx.staged?.get(input.stageKey)
  if (!staged || "skipped" in staged) {
    warnStagedSkip(ctx, {
      category: input.category,
      staged,
      fallbackKind: input.skippedKind,
      path: input.path,
      value: input.url,
    })
    return input.url
  }
  return `${parsed.base}${staged.targetPath}`
}
