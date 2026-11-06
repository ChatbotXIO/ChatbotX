import {
  automatedResponseFolderTypeByType,
  type FolderType,
  folderTypes,
  rootFolderId,
  type TemplateCategory,
} from "@chatbotx.io/database/partials"
import type { TemplateExport } from "@chatbotx.io/flow-config"
import { installRootSourceId } from "./adapters/manifests/resolve"
import { entriesForCategory, withCategoryEntries } from "./template-entries"

const isFolderType = (value: unknown): value is FolderType =>
  typeof value === "string" &&
  (folderTypes.options as readonly string[]).includes(value)

type FolderTypeOf = (entry: Record<string, unknown>) => FolderType | null

const always =
  (folderType: FolderType): FolderTypeOf =>
  () =>
    folderType

/**
 * The folder namespace each foldered category files a copy in (`null` for an
 * entry that has none). One row per category: adding a foldered category is
 * one line here. A keyword's namespace follows its direction (invariant 17);
 * bot fields share the custom-field folders (`botFieldService.create`).
 */
const FOLDER_TYPE_OF: Partial<Record<TemplateCategory, FolderTypeOf>> = {
  flows: always("flow"),
  triggers: always("trigger"),
  sequences: always("sequence"),
  keywords: (entry) =>
    entry.type === "inbound" || entry.type === "outbound"
      ? automatedResponseFolderTypeByType[entry.type]
      : null,
  fbCommentAutomations: (entry) =>
    isFolderType(entry.type) ? entry.type : null,
  settings: (entry) => (entry.kind === "botField" ? "customField" : null),
}

const FOLDERED_CATEGORIES = Object.keys(FOLDER_TYPE_OF) as TemplateCategory[]

const folderTypeOfEntry = (
  category: TemplateCategory,
  entry: Record<string, unknown>,
): FolderType | null => FOLDER_TYPE_OF[category]?.(entry) ?? null

const isAtRoot = (entry: Record<string, unknown>): boolean =>
  entry.folderId === null ||
  entry.folderId === undefined ||
  entry.folderId === rootFolderId

/** The folder namespaces that have a copy at the root of the source workspace. */
export const rootLevelFolderTypes = (
  resources: TemplateExport["resources"],
): FolderType[] => {
  const types = new Set<FolderType>()
  for (const category of FOLDERED_CATEGORIES) {
    for (const entry of entriesForCategory(resources, category)) {
      const folderType = folderTypeOfEntry(category, entry)
      if (folderType && isAtRoot(entry)) {
        types.add(folderType)
      }
    }
  }
  return [...types]
}

/**
 * Points every root-level entry at the install root of its own namespace (the
 * synthetic source id `resolveManifests` maps), so the adapters nest it with
 * the same `folderId` resolution they use for shipped folders. Entries already
 * in a shipped folder are untouched; the input is not mutated.
 */
export const placeRootEntriesInInstallRoots = (
  resources: TemplateExport["resources"],
): TemplateExport["resources"] => {
  let next = resources
  for (const category of FOLDERED_CATEGORIES) {
    const entries = entriesForCategory(resources, category)
    if (entries.length === 0) {
      continue
    }
    next = withCategoryEntries(
      next,
      category,
      entries.map((entry) => {
        const folderType = folderTypeOfEntry(category, entry)
        return folderType && isAtRoot(entry)
          ? { ...entry, folderId: installRootSourceId(folderType) }
          : entry
      }),
    )
  }
  return next
}
