import type { UpdateTagSchema } from "../schema/action"

type UpdateTagFormValues = {
  name?: string
  color?: string | null
}

type UpdateTagDirtyFields = {
  name?: boolean
  color?: boolean
}

/**
 * What the edit dialog sends: only the fields the agent changed. An omitted
 * `color` keeps the stored one, so an untouched color is never rewritten from
 * a stale copy of the row; a View-only copy never sends `name` (its lock covers
 * the name only, and a color-only save must not look like a rename).
 */
export const buildUpdateTagPayload = (input: {
  values: UpdateTagFormValues
  dirtyFields: UpdateTagDirtyFields
  isLocked: boolean
}): UpdateTagSchema => ({
  ...(input.isLocked ||
  !input.dirtyFields.name ||
  input.values.name === undefined
    ? {}
    : { name: input.values.name }),
  ...(input.dirtyFields.color ? { color: input.values.color ?? null } : {}),
})
