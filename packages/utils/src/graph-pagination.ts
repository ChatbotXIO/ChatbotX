export type CursorPaginatedResponse<T> = {
  data: T[]
  paging?: {
    cursors?: {
      after?: string
    }
    next?: string
  }
}

type CursorPageGetter<T> = (
  endpoint: string,
  options: { searchParams: Record<string, string> },
) => Promise<CursorPaginatedResponse<T>>

export async function fetchAllCursorPages<T>({
  endpoint,
  fields,
  accessToken,
  get,
  limit = 100,
  maxPages = 20,
}: {
  endpoint: string
  fields: string
  accessToken: string
  get: CursorPageGetter<T>
  limit?: number
  maxPages?: number
}): Promise<T[]> {
  const results: T[] = []
  let cursor: string | undefined
  let pageCount = 0

  while (pageCount < maxPages) {
    const searchParams: Record<string, string> = {
      fields,
      access_token: accessToken,
      limit: String(limit),
    }

    if (cursor) {
      searchParams.after = cursor
    }

    const response = await get(endpoint, { searchParams })
    results.push(...response.data)
    pageCount++

    cursor = response.paging?.next ? response.paging.cursors?.after : undefined
    if (!cursor) {
      break
    }
  }

  return results
}
