export const DEFAULT_GRAPH_PAGE_LIMIT = 100
export const DEFAULT_GRAPH_MAX_PAGES = 20

export class GraphPaginationMaxPagesReachedError extends Error {
  readonly pagesFetched: number

  constructor(pagesFetched: number) {
    super(`Graph pagination exceeded ${pagesFetched} pages`)
    this.name = "GraphPaginationMaxPagesReachedError"
    this.pagesFetched = pagesFetched
  }
}

export type CursorPaginatedResponse<T> = {
  data: T[]
  paging?: {
    cursors?: {
      after?: string
    }
    next?: string
  }
}

export type NextUrlPaginatedResponse<T> = {
  data: T[]
  paging?: {
    next?: string
  }
}

type NextUrlPageGetter<T> = (
  url: string,
) => Promise<NextUrlPaginatedResponse<T>>

/**
 * Follows a Graph API `paging.next` chain and returns every row it yields.
 *
 * `paging.next` is a fully-qualified URL chosen by the response, and callers
 * send an `Authorization` header with each request, so following it blindly
 * would hand the caller's bearer token to whatever host the payload names.
 * Only same-origin links are followed; anything else ends the walk.
 *
 * `paging` itself is optional in Graph responses — Meta omits it on
 * single-page results — so it is never dereferenced without a guard.
 *
 * Pagination is bounded by `maxPages`. Reaching that bound means the result is
 * truncated rather than complete, so this throws after `onMaxPagesReached`
 * fires and callers cannot accidentally treat a partial list as exhaustive.
 */
export async function fetchAllNextPages<T>({
  firstUrl,
  get,
  maxPages = DEFAULT_GRAPH_MAX_PAGES,
  onMaxPagesReached,
}: {
  firstUrl: string
  get: NextUrlPageGetter<T>
  maxPages?: number
  onMaxPagesReached?: (pagesFetched: number) => void
}): Promise<T[]> {
  const results: T[] = []
  const origin = new URL(firstUrl).origin
  const visitedUrls = new Set<string>()

  let nextUrl: string | undefined = firstUrl

  for (let page = 0; page < maxPages; page += 1) {
    if (!nextUrl) {
      return results
    }

    visitedUrls.add(nextUrl)
    const response = await get(nextUrl)
    results.push(...response.data)

    nextUrl = readSameOriginNextUrl({
      next: response.paging?.next,
      origin,
      visitedUrls,
    })
  }

  if (nextUrl) {
    onMaxPagesReached?.(maxPages)
    throw new GraphPaginationMaxPagesReachedError(maxPages)
  }

  return results
}

function readSameOriginNextUrl({
  next,
  origin,
  visitedUrls,
}: {
  next: string | undefined
  origin: string
  visitedUrls: Set<string>
}): string | undefined {
  if (!next || visitedUrls.has(next)) {
    return
  }

  try {
    if (new URL(next).origin !== origin) {
      return
    }
  } catch {
    return
  }

  return next
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
