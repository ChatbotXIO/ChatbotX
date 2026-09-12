import { rootFolderId } from "@chatbotx.io/database/partials"

/**
 * Root-folder semantics for a list backed by a folder column. The builder
 * renders one folder at a time (no folderId in the URL = the root view), so
 * the default scopes to unfiled rows. A public API caller listing a whole
 * resource passes `includeAllFolders: true` to drop the filter; an explicit
 * `rootFolderId` still means "unfiled only" on both paths.
 */
export function resolveFolderIdFilter(
  folderId?: string | null,
  includeAllFolders = false,
): string | { isNull: true } | undefined {
  if (folderId === rootFolderId) {
    return { isNull: true }
  }
  if (folderId) {
    return folderId
  }
  return includeAllFolders ? undefined : { isNull: true }
}
