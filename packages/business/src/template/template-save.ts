import type {
  TemplatePermissions,
  TemplateSelection,
} from "@chatbotx.io/database/partials"
import { templateRepository } from "@chatbotx.io/database/repositories"
import type { TemplateModel } from "@chatbotx.io/database/types"
import { parseTemplateExport } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import {
  type EmbeddedVideo,
  fromYoutubeVideoId,
} from "@chatbotx.io/utils/embedded-video"
import {
  EMBEDDED_VIDEO_PARSE_FAILURE_MESSAGES,
  embeddedVideoService,
} from "../embedded-video/service"
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
import { resolveTemplateEmbeddedVideo } from "./template-video"
import { describeVersionChanges } from "./version-changes"

/** A YouTube, Vimeo, Streamable or Cloudinary link, or that platform's embed code. */
export type TemplateVideoInput = { source: string }

export type SaveTemplateInput = {
  workspaceId: string
  tenantId: string
  createdBy: string | null
  name: string
  description?: string | null
  imageUrl?: string | null
  publisherName?: string | null
  /** Omitted keeps the video, `null` (or a blank source) removes it. */
  video?: TemplateVideoInput | null
  /** @deprecated Alias for a YouTube `video`; ignored when `video` is present. */
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

/** Both columns, kept in sync: the legacy one holds the id for YouTube only. */
type TemplateVideoColumns = {
  embeddedVideo?: EmbeddedVideo | null
  youtubeVideoId?: string | null
}

const CLEARED_VIDEO: TemplateVideoColumns = {
  embeddedVideo: null,
  youtubeVideoId: null,
}

/**
 * The link to parse for this save, or `undefined` when the video is left
 * alone. `video` (even `null`) beats the deprecated `youtubeVideoId`, so a
 * GET body echoed back as a PUT keeps working. A blank source means `null`.
 */
const requestedVideoSource = (
  input: Pick<SaveTemplateInput, "video" | "youtubeVideoId">,
): string | null | undefined => {
  if (input.video !== undefined) {
    return input.video?.source.trim() || null
  }
  if (input.youtubeVideoId === undefined) {
    return
  }
  const legacyId = input.youtubeVideoId?.trim()
  if (!legacyId) {
    return null
  }
  const legacy = fromYoutubeVideoId(legacyId)
  if (!legacy) {
    throw validationException("youtubeVideoId", "Invalid YouTube video id")
  }
  return `https://www.youtube.com/watch?v=${legacy.videoId}`
}

/**
 * The columns to write for the video, empty when it is unchanged. Runs after
 * the permission and scope checks, so the only outbound call (oEmbed, at most
 * one) never happens for a request that would be refused.
 */
const resolveVideoColumns = async (
  input: Pick<SaveTemplateInput, "video" | "youtubeVideoId">,
  current: EmbeddedVideo | null,
): Promise<TemplateVideoColumns> => {
  const source = requestedVideoSource(input)
  if (source === undefined) {
    return {}
  }
  if (source === null) {
    return CLEARED_VIDEO
  }
  const resolved = await embeddedVideoService.resolve(source, current)
  if (!resolved.ok) {
    throw validationException(
      "video",
      EMBEDDED_VIDEO_PARSE_FAILURE_MESSAGES[resolved.reason],
    )
  }
  const { video } = resolved
  return {
    embeddedVideo: video,
    youtubeVideoId: video.provider === "youtube" ? video.videoId : null,
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
        ...(await resolveVideoColumns(input, null)),
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
  const videoColumns = await resolveVideoColumns(
    input,
    resolveTemplateEmbeddedVideo(existing),
  )
  // Hash what the template holds now with the current algorithm and compare
  // against that: a stored hash written by an older algorithm (or a template
  // saved before versioning, which has none) must not advance the version, and
  // fan an update out to every install, when the content did not change.
  const legacyPayloadHash = await hashTemplateContent(existing.payload)
  // A template saved under an older format can not be compared: no detail then.
  const previous = parseTemplateExport(existing.payload)
  const saved = await templateRepository.saveWithVersion({
    id: existing.id,
    workspaceId: input.workspaceId,
    versionId: createId(),
    set: { ...contents, ...videoColumns },
    snapshot: {
      ...snapshot,
      changes: previous.ok
        ? describeVersionChanges(previous.data, payload)
        : null,
    },
    legacyPayloadHash,
    basedOnVersion: existing.version,
  })
  if (!saved) {
    throw notFoundException("Template not found")
  }
  if (saved.version !== existing.version) {
    await onVersionAdvanced(saved)
  }
  return saved
}
