import type { SocialMediaKind } from "@chatbotx.io/database/partials"
import type { SocialMediaInsert } from "@chatbotx.io/database/repositories"
import { uploader } from "@chatbotx.io/filesystem"
import { createId } from "@chatbotx.io/utils"
import {
  knownMimeTypes,
  type MediaSpec,
} from "@chatbotx.io/utils/post-publishing"
import { validationException } from "../errors"
import { logger } from "../logger"
import { mediaLibraryService } from "../media-library/service"
import { mediaLibraryFileService } from "../media-library-file/service"
import {
  MediaImportRefusedError,
  registeredMediaUrlImporter,
} from "./media-url-importer"
import type { SocialMediaInput } from "./types"

/** Most files one post (or one destination's override) can carry: the largest carousel any network accepts. */
export const MAX_SOCIAL_MEDIA_PER_POST = 20
/**
 * A file imported from a URL inside a request is capped well below the
 * networks' own limits: a large video is passed by `mediaLibraryFileId`
 * (uploaded to the library first), so one request never streams hundreds of MB.
 */
export const SOCIAL_MEDIA_IMPORT_FILE_MAX_BYTES = 50 * 1024 * 1024
/** All files imported by one request together. */
export const SOCIAL_MEDIA_IMPORT_TOTAL_MAX_BYTES = 100 * 1024 * 1024
/** One deadline for all imports of a request, not one per file. */
export const SOCIAL_MEDIA_IMPORT_TOTAL_TIMEOUT_MS = 60_000

/** The formats a URL import stores: the common image formats and the video types the publishing rules know. */
export const IMPORTABLE_MEDIA_MIME_TYPES: readonly string[] = [
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  ...knownMimeTypes("video"),
]

const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v)(\?|#|$)/i
const IMAGE_PREFIX = "image/"
const VIDEO_PREFIX = "video/"

const kindOfMimeType = (mimeType: string): SocialMediaKind | null => {
  if (mimeType.startsWith(IMAGE_PREFIX)) {
    return "image"
  }
  return mimeType.startsWith(VIDEO_PREFIX) ? "video" : null
}

const unsupportedMedia = () =>
  validationException("media", "Only images and videos can be published")

const exactlyOneSource = (input: SocialMediaInput): void => {
  if (Boolean(input.mediaLibraryFileId) === Boolean(input.url)) {
    throw validationException(
      "media",
      "Give either mediaLibraryFileId or url for each file",
    )
  }
}

type ImportedFile = { fileId: string }

/**
 * The files one request brings in. It owns the request's single deadline and
 * byte budget, and remembers every library file it created, so a request that
 * fails later (a lost idempotency race, a rolled-back transaction, a refused
 * update) can remove them with `cleanup()`. Nothing outlives a failed call.
 */
export class MediaImportSession {
  private readonly imported: ImportedFile[] = []
  private remainingBytes = SOCIAL_MEDIA_IMPORT_TOTAL_MAX_BYTES
  private signal: AbortSignal | null = null

  private readonly workspaceId: string

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId
  }

  /** The files this session created (for tests and cleanup). */
  get importedFileIds(): string[] {
    return this.imported.map((file) => file.fileId)
  }

  /**
   * Turns the caller's media list into rows ready to insert: library files are
   * checked to be the workspace's own, URLs are imported (before any
   * transaction, so no download happens while one is open).
   */
  async resolve(
    inputs: readonly SocialMediaInput[],
  ): Promise<SocialMediaInsert[]> {
    if (inputs.length > MAX_SOCIAL_MEDIA_PER_POST) {
      throw validationException(
        "media",
        `At most ${MAX_SOCIAL_MEDIA_PER_POST} files per post`,
      )
    }
    const rows: SocialMediaInsert[] = []
    for (const [position, input] of inputs.entries()) {
      exactlyOneSource(input)
      rows.push(
        input.mediaLibraryFileId
          ? await this.fromLibrary(input, position)
          : await this.fromUrl(input, position),
      )
    }
    return rows
  }

  /** Removes every file this session imported; failures are logged, never thrown. */
  async cleanup(): Promise<void> {
    const files = this.imported.splice(0)
    for (const file of files) {
      try {
        await mediaLibraryService.deleteFile({
          fileId: file.fileId,
          workspaceId: this.workspaceId,
        })
      } catch (error) {
        logger.warn(
          { err: error, fileId: file.fileId, workspaceId: this.workspaceId },
          "failed to remove a media file imported by a failed request",
        )
      }
    }
  }

  private async fromLibrary(
    input: SocialMediaInput,
    position: number,
  ): Promise<SocialMediaInsert> {
    const file = await mediaLibraryFileService.findById({
      id: input.mediaLibraryFileId ?? "",
      workspaceId: this.workspaceId,
    })
    if (!file) {
      throw validationException("media", "A media file was not found")
    }
    const kind = kindOfMimeType(file.mimeType)
    if (!kind) {
      throw unsupportedMedia()
    }
    return {
      altText: input.altText ?? null,
      durationMs: null,
      height: null,
      id: createId(),
      kind,
      mediaLibraryFileId: file.id,
      mimeType: file.mimeType,
      path: file.path,
      position,
      size: file.size,
      width: null,
      workspaceId: this.workspaceId,
    }
  }

  /**
   * Imports a public URL into the workspace's library through the registered
   * importer: it connects only to addresses the SSRF guard vetted for each hop,
   * stores only the importable formats, and is bounded by the file cap, the
   * request's remaining byte budget and the request's one deadline.
   */
  private async fromUrl(
    input: SocialMediaInput,
    position: number,
  ): Promise<SocialMediaInsert> {
    const importer = registeredMediaUrlImporter()
    if (!importer) {
      throw validationException(
        "media",
        "Importing a file from a URL is not available here; upload it to the Media Library and pass its id",
      )
    }
    this.signal ??= AbortSignal.timeout(SOCIAL_MEDIA_IMPORT_TOTAL_TIMEOUT_MS)
    const maxBytes = Math.min(
      SOCIAL_MEDIA_IMPORT_FILE_MAX_BYTES,
      this.remainingBytes,
    )
    if (maxBytes <= 0) {
      throw validationException(
        "media",
        "The files imported from URLs are too large together; upload them to the Media Library and pass their ids",
      )
    }
    const path = `public/space/${this.workspaceId}/media-library/${createId()}`
    let imported: Awaited<ReturnType<typeof importer>>
    try {
      imported = await importer({
        allowedMimeTypes: IMPORTABLE_MEDIA_MIME_TYPES,
        maxBytes,
        path,
        signal: this.signal,
        url: input.url ?? "",
      })
    } catch (error) {
      if (error instanceof MediaImportRefusedError) {
        throw validationException("media", error.message)
      }
      throw error
    }
    this.remainingBytes -= imported.size
    const kind = kindOfMimeType(imported.mimeType)
    if (!(kind && IMPORTABLE_MEDIA_MIME_TYPES.includes(imported.mimeType))) {
      // Stored by the importer but not publishable: drop the object.
      await this.discard(path)
      throw unsupportedMedia()
    }
    const file = await this.register(path, imported)
    return {
      altText: input.altText ?? null,
      durationMs: null,
      height: imported.height,
      id: createId(),
      kind,
      mediaLibraryFileId: file.id,
      mimeType: imported.mimeType,
      path,
      position,
      size: imported.size,
      width: imported.width,
      workspaceId: this.workspaceId,
    }
  }

  private async register(
    path: string,
    imported: { mimeType: string; name: string; size: number },
  ) {
    try {
      const file = await mediaLibraryService.createFile({
        mimeType: imported.mimeType,
        name: imported.name,
        path,
        size: imported.size,
        workspaceId: this.workspaceId,
      })
      this.imported.push({ fileId: file.id })
      return file
    } catch (error) {
      await this.discard(path)
      throw error
    }
  }

  private async discard(path: string): Promise<void> {
    // The object has no library row yet, so only storage needs cleaning; the
    // library service removes both for a registered file.
    await uploader.deleteObject(path).catch((error: unknown) => {
      logger.warn(
        { err: error, path },
        "failed to drop an unusable media object",
      )
    })
  }
}

/**
 * What the rules can check about a media list without importing anything: a
 * library file reports its real type and size, a URL only a guess from its
 * extension (its size and format are checked when it is imported).
 */
export const specsOf = async (
  workspaceId: string,
  inputs: readonly SocialMediaInput[],
): Promise<MediaSpec[]> => {
  const specs: MediaSpec[] = []
  for (const input of inputs) {
    exactlyOneSource(input)
    if (input.mediaLibraryFileId) {
      const file = await mediaLibraryFileService.findById({
        id: input.mediaLibraryFileId,
        workspaceId,
      })
      if (!file) {
        throw validationException("media", "A media file was not found")
      }
      const kind = kindOfMimeType(file.mimeType)
      if (!kind) {
        throw unsupportedMedia()
      }
      specs.push({
        durationMs: null,
        kind,
        mimeType: file.mimeType,
        size: file.size,
      })
    } else {
      specs.push({
        durationMs: null,
        kind: VIDEO_EXTENSIONS.test(input.url ?? "") ? "video" : "image",
        mimeType: null,
        size: null,
      })
    }
  }
  return specs
}

/** The same specs from rows already stored (a duplicate or an update that keeps its media). */
export const specsOfRows = (
  rows: readonly {
    durationMs: number | null
    kind: SocialMediaKind
    mimeType: string
    size: number
  }[],
): MediaSpec[] =>
  rows.map((row) => ({
    durationMs: row.durationMs,
    kind: row.kind,
    mimeType: row.mimeType,
    size: row.size,
  }))
