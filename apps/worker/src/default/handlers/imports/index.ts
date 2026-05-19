import type { ImportType } from "@chatbotx.io/database/partials"
import type { ImportTypeHandler } from "./base-import"
import { contactsImportHandler } from "./handler/contacts/handler"

// biome-ignore lint/suspicious/noExplicitAny: handler generics intentionally erased at registry boundary
export type AnyImportTypeHandler = ImportTypeHandler<any, any, any>

export const importHandlers = {
  contacts: contactsImportHandler,
} as const satisfies Record<ImportType, AnyImportTypeHandler>

export type { ImportRow, ImportTypeHandler } from "./base-import"
export { runImportPipeline } from "./base-import"
