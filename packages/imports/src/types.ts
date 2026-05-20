import type { ImportFormat, ImportType } from "@chatbotx.io/database/partials"

export type BuildPathInput = {
  workspaceId: string
  fileName: string
}

export type ImportHandlerByType = {
  [T in ImportType]: {
    buildPath: (input: BuildPathInput, entry: ImportEntry<T>) => string
  }
}

export type ImportHandler<T extends ImportType = ImportType> =
  ImportHandlerByType[T]

export type ImportConfig = {
  type: ImportType
  acceptedFormats: readonly ImportFormat[]
  acceptedMimeTypes: readonly string[]
  acceptedExtensions: Record<string, string[]>
  maxFileSizeMB: number
  maxRows: number
  paths: {
    storageUrl: string
  }
}

export type ImportEntry<T extends ImportType = ImportType> = {
  config: ImportConfig
  handler: ImportHandler<T>
}
