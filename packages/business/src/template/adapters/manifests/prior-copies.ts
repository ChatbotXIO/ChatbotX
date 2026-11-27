/**
 * The copy each manifest entry reuses: the newest field an earlier install of
 * this workspace created from the same source field that still exists with the
 * same type. Shared by the install and its preview, so they cannot disagree.
 */
export const pickPriorCopies = <Field extends { id: string; type: string }>(
  prior: readonly { sourceResourceId: string; resourceId: string }[],
  fields: readonly Field[],
  entries: readonly (readonly [string, { type: string }])[],
): Map<string, Field> => {
  const fieldById = new Map(fields.map((field) => [field.id, field]))
  const manifestBySource = new Map(entries)
  const picked = new Map<string, Field>()
  // Newest first: the most recent live copy of a source field wins.
  for (const row of prior) {
    const source = manifestBySource.get(row.sourceResourceId)
    const field = fieldById.get(row.resourceId)
    if (
      picked.has(row.sourceResourceId) ||
      !source ||
      !field ||
      field.type !== source.type
    ) {
      continue
    }
    picked.set(row.sourceResourceId, field)
  }
  return picked
}
