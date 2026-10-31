import type {
  TemplatePermissions,
  TemplateSelection,
} from "@chatbotx.io/database/partials"
import { templateRepository } from "@chatbotx.io/database/repositories"
import type { TemplateModel } from "@chatbotx.io/database/types"
import { parseTemplateExport } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { notFoundException, validationException } from "../errors"
import { mediaLibraryFileService } from "../media-library-file/service"
import { hashTemplatePayload } from "./payload-hash"
import {
  assertCanManageTemplates,
  assertCanUseTemplateCategories,
  type TemplateActor,
} from "./permissions"
import { generateShareToken } from "./share-token"
import { buildTemplateSnapshot } from "./snapshot.service"

export type SaveTemplateInput = {
  workspaceId: string
  tenantId: string
  createdBy: string | null
  name: string
  description?: string | null
  imageUrl?: string | null
  publisherName?: string | null
  youtubeVideoId?: string | null
  testLink?: string | null
  selection: TemplateSelection
  defaultPermissions: TemplatePermissions
  createInstallFolder: boolean
  defaultAutoUpdate: boolean
  existingTemplateId?: string
  actor: TemplateActor
}

/**
 * The content hash of a payload as the schema reads it: defaults applied, so
 * a payload written before newer categories existed hashes the same as the
 * snapshot that now lists them as empty. Falls back to the raw payload when it
 * does not parse (the install rejects such a payload anyway).
 */
const hashTemplateContent = async (
  payload: Readonly<Record<string, unknown>>,
): Promise<string> => {
  const parsed = parseTemplateExport(payload)
  return await hashTemplatePayload(parsed.ok ? parsed.data : payload)
}

/**
 * The cover image is picked from this workspace's media library, never an
 * arbitrary storage path. A path the template already holds (saved before this
 * rule) is kept as it is, so an older template still saves.
 */
const assertCoverImageInMediaLibrary = async (
  workspaceId: string,
  imageUrl: string | null | undefined,
  current: string | null,
): Promise<void> => {
  if (!imageUrl || imageUrl === current) {
    return
  }
  const file = await mediaLibraryFileService.findByPath({
    workspaceId,
    path: imageUrl,
  })
  if (!file?.mimeType.startsWith("image/")) {
    throw validationException(
      "imageUrl",
      "Pick the cover image from the images in this workspace's media library",
    )
  }
}

/**
 * Resolves the selection to a concrete, validated snapshot payload and
 * persists it. `mode:"all"` is expanded to the current row set: the stored
 * payload is frozen from this point until the next save. `onVersionAdvanced`
 * runs after commit when an update produced a new version.
 */
export const saveTemplate = async (
  input: SaveTemplateInput,
  onVersionAdvanced: (saved: TemplateModel) => Promise<void>,
): Promise<TemplateModel> => {
  assertCanManageTemplates(input.actor)
  const { payload, categoryCounts } = await buildTemplateSnapshot({
    workspaceId: input.workspaceId,
    tenantId: input.tenantId,
    selection: input.selection,
  })
  // Checked on the FINAL payload, so auto-collected dependencies and
  // manifests count too, not only what the picker showed.
  assertCanUseTemplateCategories(input.actor, categoryCounts)
  const payloadHash = await hashTemplateContent(payload)
  const snapshot = {
    payload,
    payloadHash,
    formatVersion: payload.formatVersion,
  }
  const contents = {
    name: input.name,
    description: input.description,
    imageUrl: input.imageUrl,
    publisherName: input.publisherName,
    youtubeVideoId: input.youtubeVideoId,
    testLink: input.testLink,
    selection: input.selection,
    payload,
    categoryCounts,
    formatVersion: payload.formatVersion,
    defaultPermissions: input.defaultPermissions,
    createInstallFolder: input.createInstallFolder,
    defaultAutoUpdate: input.defaultAutoUpdate,
  }

  if (!input.existingTemplateId) {
    await assertCoverImageInMediaLibrary(
      input.workspaceId,
      input.imageUrl,
      null,
    )
    return await templateRepository.createWithFirstVersion({
      values: {
        ...contents,
        id: createId(),
        workspaceId: input.workspaceId,
        tenantId: input.tenantId,
        createdBy: input.createdBy,
        shareToken: generateShareToken(),
        shareEnabled: false,
        version: 1,
        payloadHash,
      },
      versionId: createId(),
      snapshot,
    })
  }

  const existing = await templateRepository.findLive({
    id: input.existingTemplateId,
    workspaceId: input.workspaceId,
  })
  if (!existing) {
    throw notFoundException("Template not found")
  }
  await assertCoverImageInMediaLibrary(
    input.workspaceId,
    input.imageUrl,
    existing.imageUrl,
  )
  // Hash what the template holds now with the current algorithm and compare
  // against that: a stored hash written by an older algorithm (or a template
  // saved before versioning, which has none) must not advance the version, and
  // fan an update out to every install, when the content did not change.
  const legacyPayloadHash = await hashTemplateContent(existing.payload)
  const saved = await templateRepository.saveWithVersion({
    id: existing.id,
    workspaceId: input.workspaceId,
    versionId: createId(),
    set: contents,
    snapshot,
    legacyPayloadHash,
  })
  if (!saved) {
    throw notFoundException("Template not found")
  }
  if (saved.version !== existing.version) {
    await onVersionAdvanced(saved)
  }
  return saved
}
