/**
 * Importing a file from a public URL needs a socket pinned to the addresses the
 * SSRF guard vetted, which is Node-only (`node:https`). The business package is
 * reached by the builder's Edge-traced router graph and must stay free of Node
 * imports (AGENTS.md invariant 25), so the importer is injected: the builder's
 * Node route handlers register theirs at start-up. A process that did not
 * register one (a test, a worker) refuses URL imports instead of falling back to
 * an unpinned fetch.
 */

/** A URL import the importer refused, with a message that is safe to show the caller. */
export class MediaImportRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MediaImportRefusedError"
  }
}

export type MediaUrlImportInput = {
  /** Largest body accepted; a larger one is refused before it is stored. */
  maxBytes: number
  /** The MIME types that may be stored; any other `Content-Type` is refused. */
  allowedMimeTypes: readonly string[]
  /** Where the file is stored. */
  path: string
  /** Aborts the download (the request's total deadline). */
  signal: AbortSignal
  url: string
}

export type ImportedMediaFile = {
  height: number | null
  mimeType: string
  name: string
  size: number
  width: number | null
}

/**
 * Downloads `url` and stores it at `path`. Every request, redirect hops
 * included, connects only to addresses the SSRF guard returned for that exact
 * URL, so a name that resolves differently at connect time cannot reach an
 * internal address. Throws `MediaImportRefusedError` for a caller-fault refusal.
 */
export type MediaUrlImporter = (
  input: MediaUrlImportInput,
) => Promise<ImportedMediaFile>

let registered: MediaUrlImporter | null = null

export const registerMediaUrlImporter = (importer: MediaUrlImporter): void => {
  registered = importer
}

export const registeredMediaUrlImporter = (): MediaUrlImporter | null =>
  registered
