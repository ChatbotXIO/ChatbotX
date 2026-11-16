/**
 * Kept apart from `text-extractor.ts` so callers can classify extraction
 * failures without importing the parsers and the storage client.
 */

/** The stored file is larger than the extraction byte limit. Permanent. */
export class FileSizeLimitError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "FileSizeLimitError"
  }
}

/** Reading the file from storage failed. Possibly transient, so retryable. */
export class FileFetchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "FileFetchError"
  }
}

/**
 * The file's type is not a knowledge format and cannot be inferred from its
 * name. Permanent: decoding it as UTF-8 would only index noise.
 */
export class UnsupportedKnowledgeFileTypeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "UnsupportedKnowledgeFileTypeError"
  }
}
