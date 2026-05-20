import { type ImportType, importTypes } from "@chatbotx.io/database/partials"
import { handler as contactsHandler } from "./modules/contacts"
import type { ImportConfig, ImportEntry, ImportHandler } from "./types"

const configs: Record<ImportType, ImportConfig> = {
  [importTypes.enum.contacts]: {
    type: importTypes.enum.contacts,
    maxFileSizeMB: 20,
    maxRows: 100_000,
    acceptedFormats: ["csv"],
    acceptedMimeTypes: ["text/csv", "application/octet-stream"],
    acceptedExtensions: {
      "text/csv": [".csv"],
    },
    paths: {
      storageUrl: "workspaces/:workspaceId/imports/contacts/:fileName",
    },
  },
}

const handlers: { [T in ImportType]: ImportHandler<T> } = {
  [importTypes.enum.contacts]: contactsHandler,
}

export const importRegistry = {
  [importTypes.enum.contacts]: {
    config: configs[importTypes.enum.contacts],
    handler: handlers[importTypes.enum.contacts],
  },
} satisfies { [T in ImportType]: ImportEntry<T> }

export type ImportRegistry = typeof importRegistry

export const getImportEntry = <T extends ImportType>(
  type: T,
): ImportRegistry[T] => importRegistry[type]
