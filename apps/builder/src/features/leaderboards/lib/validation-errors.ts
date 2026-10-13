/**
 * Field-scoped service errors (`validationException("rules.comments.points",
 * …)`) travel back through next-safe-action's `validationErrors`, which is a
 * nested `{ field: { _errors: [] } }` tree. These two helpers convert a
 * dotted path to that tree (server) and the tree back to dotted paths (form).
 */
export function toNestedValidationErrors(field: string, message: string) {
  const root: Record<string, unknown> = {}
  let cursor = root
  const parts = field.split(".").filter(Boolean)
  parts.forEach((part, index) => {
    const next: Record<string, unknown> =
      index === parts.length - 1 ? { _errors: [message] } : {}
    cursor[part] = next
    cursor = next
  })
  return parts.length > 0 ? root : { _errors: [message] }
}

export function flattenValidationErrors(
  errors: unknown,
  prefix = "",
): { path: string; message: string }[] {
  if (!errors || typeof errors !== "object") {
    return []
  }
  const result: { path: string; message: string }[] = []
  for (const [key, value] of Object.entries(errors)) {
    if (key === "_errors") {
      const message = Array.isArray(value) ? value[0] : undefined
      if (typeof message === "string" && prefix) {
        result.push({ path: prefix, message })
      }
      continue
    }
    result.push(
      ...flattenValidationErrors(value, prefix ? `${prefix}.${key}` : key),
    )
  }
  return result
}
