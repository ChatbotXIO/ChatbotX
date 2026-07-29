import { contactsImportHandler } from "./handler/contacts/handler"
import { couponsImportHandler } from "./handler/coupons/handler"
import { productsImportHandler } from "./handler/products/handler"

export const importHandlers = {
  contacts: contactsImportHandler,
  coupons: couponsImportHandler,
  products: productsImportHandler,
} as const

export type { ImportRow, ImportTypeHandler } from "./base-import"
export { runImportPipeline } from "./base-import"
