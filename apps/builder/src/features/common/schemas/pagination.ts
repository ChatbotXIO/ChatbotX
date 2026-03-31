export type PaginatedResponse<T> = {
  data: T[]
  pageCount: number
}

export type BaseCursorCollection<T> = {
  data: T[]
  nextCursor: string | null
  prevCursor: string | null
}
