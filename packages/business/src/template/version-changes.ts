import {
  type TemplateCategory,
  type TemplateVersionChange,
  templateCategories,
} from "@chatbotx.io/database/partials"
import type { TemplateExport } from "@chatbotx.io/flow-config"
import { canonicalize } from "./fingerprint"
import { entriesForCategory } from "./template-entries"

type VersionItem = { name: string; content: string }

const MANIFEST_OF_CATEGORY: Partial<
  Record<TemplateCategory, keyof TemplateExport["manifests"]>
> = {
  tags: "tags",
  customFields: "customFields",
  productCategories: "productCategories",
}

const displayName = (entry: Record<string, unknown>, id: string): string => {
  const name = entry.name ?? entry.shortcut ?? entry.title
  return typeof name === "string" && name ? name : id
}

const itemsOfCategory = (
  payload: TemplateExport,
  category: TemplateCategory,
): Map<string, VersionItem> => {
  const manifestKey = MANIFEST_OF_CATEGORY[category]
  const rows: [string, Record<string, unknown>][] = manifestKey
    ? Object.entries(
        (payload.manifests[manifestKey] ?? {}) as Record<
          string,
          Record<string, unknown>
        >,
      )
    : entriesForCategory(payload.resources, category).map((entry) => [
        entry.sourceId,
        entry,
      ])
  return new Map(
    rows.map(([id, entry]) => [
      id,
      {
        name: displayName(entry, id),
        content: JSON.stringify(canonicalize(entry)),
      },
    ]),
  )
}

/** What `next` added, changed and removed against `previous`, per category. */
export const describeVersionChanges = (
  previous: TemplateExport,
  next: TemplateExport,
): TemplateVersionChange[] =>
  templateCategories.options.flatMap((category) => {
    const before = itemsOfCategory(previous, category)
    const after = itemsOfCategory(next, category)
    const added: string[] = []
    const changed: string[] = []
    for (const [id, item] of after) {
      const earlier = before.get(id)
      if (!earlier) {
        added.push(item.name)
      } else if (earlier.content !== item.content) {
        changed.push(item.name)
      }
    }
    const removed = [...before]
      .filter(([id]) => !after.has(id))
      .map(([, item]) => item.name)
    return added.length + changed.length + removed.length > 0
      ? [{ category, added, changed, removed }]
      : []
  })

/** Several versions' changes as one list, for an update that spans them. */
export const mergeVersionChanges = (
  versions: readonly TemplateVersionChange[][],
): TemplateVersionChange[] => {
  const merged = new Map<TemplateCategory, TemplateVersionChange>()
  for (const change of versions.flat()) {
    const current = merged.get(change.category)
    merged.set(change.category, {
      category: change.category,
      added: [...new Set([...(current?.added ?? []), ...change.added])],
      changed: [...new Set([...(current?.changed ?? []), ...change.changed])],
      removed: [...new Set([...(current?.removed ?? []), ...change.removed])],
    })
  }
  return [...merged.values()]
}
