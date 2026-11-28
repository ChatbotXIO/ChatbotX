export type TagNamesDiff = {
  added: string[]
  removed: string[]
}

/**
 * What the agent changed between two views of the editor: the names new in
 * `next` and the names gone from it. Only this goes to the server, never the
 * whole set, so tags another agent added since the editor was loaded survive.
 */
export const diffTagNames = (
  previous: readonly string[],
  next: readonly string[],
): TagNamesDiff => ({
  added: next.filter((name) => !previous.includes(name)),
  removed: previous.filter((name) => !next.includes(name)),
})
