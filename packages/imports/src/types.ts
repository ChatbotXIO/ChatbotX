import type {
  ContactImportColumnMap,
  ContactImportFieldMapping,
  ImportFormat,
  ImportType,
} from "@chatbotx.io/database/partials"
import type { ContactRow } from "./modules/contacts/extractor"

export type RowExtractor<TRow, TColumnMap, TFieldMapping, TOptions> = (
  row: Record<string, unknown>,
  columnMap: TColumnMap,
  fieldMapping?: TFieldMapping,
  options?: TOptions,
) => TRow | null

export type ContactRowExtractor = RowExtractor<
  ContactRow,
  ContactImportColumnMap,
  ContactImportFieldMapping,
  { countryCode?: string }
>

export type ImportHandlerByType = {
  contacts: { extractRowData: ContactRowExtractor }
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
}

export type ImportEntry<T extends ImportType = ImportType> = {
  config: ImportConfig
  handler: ImportHandler<T>
}
