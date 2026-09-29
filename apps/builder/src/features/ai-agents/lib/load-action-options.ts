type Page<T> = { data: T[]; pageCount: number }

/** Fetch every page: action configuration must not silently omit record 101. */
export async function loadAllActionOptions<T>(
  list: (page: number) => Promise<Page<T>>,
): Promise<T[]> {
  const first = await list(1)
  if (first.pageCount <= 1) {
    return first.data
  }
  const remaining = await Promise.all(
    Array.from({ length: first.pageCount - 1 }, (_, index) => list(index + 2)),
  )
  return first.data.concat(...remaining.map((page) => page.data))
}
