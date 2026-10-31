import {
  automatedResponseFolderTypeByType,
  type FolderType,
  folderTypes,
  rootFolderId,
  type TemplateCategory,
} from "@chatbotx.io/database/partials"
import type { TemplateExport } from "@chatbotx.io/flow-config"
import { installRootSourceId } from "./adapters/manifests/resolve"
import { entriesForCategory } from "./template-entries"

/** Categories whose copies live in one folder namespace, whatever the entry says. */
const FIXED_FOLDER_TYPE: Partial<Record<TemplateCategory, FolderType>> = {
  flows: "flow",
  triggers: "trigger",
  sequences: "sequence",
}

const isFolderType = (value: unknown): value is FolderType =>
  typeof value === "string" &&
  (folderTypes.options as readonly string[]).includes(value)

/**
 * The folder namespace an entry's copy is filed in, or `null` for a category
 * that has no folders. A keyword's namespace follows its direction (invariant
 * 17: inbound and outbound rules never share one).
 */
const folderTypeOfEntry = (
  category: TemplateCategory,
  entry: Record<string, unknown>,
): FolderType | null => {
  const fixed = FIXED_FOLDER_TYPE[category]
  if (fixed) {
    return fixed
  }
  if (category === "keywords") {
    return entry.type === "inbound" || entry.type === "outbound"
      ? automatedResponseFolderTypeByType[entry.type]
      : null
  }
  if (category === "fbCommentAutomations" && isFolderType(entry.type)) {
    return entry.type
  }
  return null
}

const isAtRoot = (entry: Record<string, unknown>): boolean =>
  entry.folderId === null ||
  entry.folderId === undefined ||
  entry.folderId === rootFolderId

const FOLDERED_CATEGORIES: readonly TemplateCategory[] = [
  "flows",
  "triggers",
  "sequences",
  "keywords",
  "fbCommentAutomations",
]

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
  const next: Record<string, unknown> = { ...resources }
  for (const category of FOLDERED_CATEGORIES) {
    const entries = entriesForCategory(resources, category)
    if (entries.length === 0) {
      continue
    }
    next[category] = entries.map((entry) => {
      const folderType = folderTypeOfEntry(category, entry)
      return folderType && isAtRoot(entry)
        ? { ...entry, folderId: installRootSourceId(folderType) }
        : entry
    })
  }
  return next as TemplateExport["resources"]
}
