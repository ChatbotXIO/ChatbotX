import { type ImportType, importTypes } from "@chatbotx.io/database/partials"
import { handler as contactsHandler } from "./modules/contacts"
import { handler as couponsHandler } from "./modules/coupons"
import type { ImportConfig, ImportEntry, ImportHandler } from "./types"

const configs: Record<ImportType, ImportConfig> = {
  [importTypes.enum.contacts]: {
    type: importTypes.enum.contacts,
    maxFileSizeMB: 20,
    maxRows: 100_000,
    acceptedFormats: ["csv"],
    // H-6: "application/octet-stream" is the generic binary MIME type; any file
    // could match it and would fail at job time with "format not supported".
    acceptedMimeTypes: ["text/csv"],
    acceptedExtensions: {
      "text/csv": [".csv"],
    },
    paths: {
      storageUrl: "workspaces/:workspaceId/imports/contacts/:fileName",
    },
  },
  [importTypes.enum.coupons]: {
    type: importTypes.enum.coupons,
    maxFileSizeMB: 10,
    maxRows: 10_000,
    acceptedFormats: ["csv"],
    acceptedMimeTypes: ["text/csv"],
    acceptedExtensions: {
      "text/csv": [".csv"],
    },
    paths: {
      storageUrl: "workspaces/:workspaceId/imports/coupons/:fileName",
    },
  },
}

const handlers: { [T in ImportType]: ImportHandler<T> } = {
  [importTypes.enum.contacts]: contactsHandler,
  [importTypes.enum.coupons]: couponsHandler,
}

export const importRegistry = {
  [importTypes.enum.contacts]: {
    config: configs[importTypes.enum.contacts],
    handler: handlers[importTypes.enum.contacts],
  },
  [importTypes.enum.coupons]: {
    config: configs[importTypes.enum.coupons],
    handler: handlers[importTypes.enum.coupons],
  },
} satisfies { [T in ImportType]: ImportEntry<T> }

export type ImportRegistry = typeof importRegistry

export const getImportEntry = <T extends ImportType>(
  type: T,
): ImportRegistry[T] => importRegistry[type]
