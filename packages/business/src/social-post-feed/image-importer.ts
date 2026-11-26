import type { SocialPostFeedImageError } from "@chatbotx.io/database/partials"

/**
 * Importing a feed item's picture needs a socket pinned to vetted addresses and
 * the native image library (sharp): both Node-only, so the importer is injected
 * (the worker and the builder's Node route handlers register it from
 * `net/feed-image-import.ts`). The business package is reached by the builder's
 * Edge-traced router graph and must not import them (AGENTS.md invariant 25).
 * A process that registered none imports no pictures: posts go out without.
 */

/** A picture that could not be used; `code` is stored on the ledger row. */
export class FeedImageImportError extends Error {
  readonly code: SocialPostFeedImageError

  constructor(code: SocialPostFeedImageError, message: string) {
    super(message)
    this.name = "FeedImageImportError"
    this.code = code
  }
}

export type FeedImageImportInput = {
  /** Where the re-encoded file is stored. */
  path: string
  signal: AbortSignal
  url: string
}

export type ImportedFeedImage = {
  height: number
  mimeType: string
  name: string
  size: number
  width: number
}

/**
 * Downloads `url` (https; http only when an https upgrade failed), re-encodes it
 * as a metadata-free JPEG or PNG of at most 2048 px and stores it at `path`.
 * Throws {@link FeedImageImportError}.
 */
export type FeedImageImporter = (
  input: FeedImageImportInput,
) => Promise<ImportedFeedImage>

let registered: FeedImageImporter | null = null

export const registerFeedImageImporter = (
  importer: FeedImageImporter,
): void => {
  registered = importer
}

export const registeredFeedImageImporter = (): FeedImageImporter | null =>
  registered
