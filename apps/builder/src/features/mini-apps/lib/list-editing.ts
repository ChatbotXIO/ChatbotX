/** Immutable edits of item lists: screens, options, images, navigation items. */

/** `items` with the item at `from` moved to `to`; the same array when either is out of range. */
export const moveItem = <T>(items: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= items.length || from < 0 || from >= items.length) {
    return items
  }
  const next = [...items]
  const [moved] = next.splice(from, 1)
  if (moved !== undefined) {
    next.splice(to, 0, moved)
  }
  return next
}

export const removeItem = <T>(items: readonly T[], index: number): T[] =>
  items.filter((_, position) => position !== index)

/** `items` with `change` merged into the item at `index`. */
export const patchItem = <T extends object>(
  items: readonly T[],
  index: number,
  change: Partial<T>,
): T[] =>
  items.map((item, position) =>
    position === index ? { ...item, ...change } : item,
  )

/** `prefix_N` for the first N, counting on from the list length, not in `taken`. */
export const nextFreeId = (
  prefix: string,
  taken: readonly string[],
): string => {
  let counter = taken.length + 1
  while (taken.includes(`${prefix}_${counter}`)) {
    counter++
  }
  return `${prefix}_${counter}`
}
