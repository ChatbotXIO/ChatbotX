import type {
  ContactImportColumnMap,
  ProductImportColumnMap,
} from "@chatbotx.io/database/partials"
import {
  matchContactImportHeaders,
  matchProductImportHeaders,
} from "@chatbotx.io/imports"
import { validationException } from "../errors"
import { peekImportHeaders } from "./peek-headers"

/**
 * The column map the builder's import dialogs pre-fill, from the same header
 * matchers, so an API caller can send it back as is instead of mapping every
 * column by hand.
 */
export const suggestContactImportColumnMap = (
  headers: readonly string[],
): Partial<ContactImportColumnMap> => matchContactImportHeaders(headers)

export const suggestProductImportColumnMap = (
  headers: readonly string[],
): Partial<ProductImportColumnMap> => matchProductImportHeaders(headers)

/**
 * The caller's product column map, or the suggested one read from the
 * uploaded file when none was sent. A file whose name column cannot be
 * recognised is a 422 listing its headers.
 */
export async function resolveProductImportColumnMap(input: {
  workspaceId: string
  fileId: string
  columnMap?: ProductImportColumnMap
}): Promise<ProductImportColumnMap> {
  if (input.columnMap) {
    return input.columnMap
  }
  const headers = await peekImportHeaders({
    workspaceId: input.workspaceId,
    fileId: input.fileId,
    type: "products",
  })
  const { name, ...rest } = suggestProductImportColumnMap(headers)
  if (!name) {
    throw validationException(
      "columnMap",
      `No column was recognised as the product name (file headers: ${headers.join(", ")}). Send columnMap.`,
    )
  }
  return { name, ...rest }
}
