import type { ImportHandler } from "../../types"
import { extractRowData } from "./extractor"

export { type ContactRow, extractRowData } from "./extractor"

export const handler: ImportHandler<"contacts"> = {
  extractRowData,
}
