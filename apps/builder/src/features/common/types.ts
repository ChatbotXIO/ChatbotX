export type CursorPagination = {
  direction: "next" | "prev"
  createdAt: Date
  id: string
}

export type BaseCursorCollection<T> = {
  data: T[]
  nextCursor: CursorPagination | null
  prevCursor: CursorPagination | null
}
