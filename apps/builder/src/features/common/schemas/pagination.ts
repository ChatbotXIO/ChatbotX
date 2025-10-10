import { z } from "zod"

export const cursorPagination = z.object({
  direction: z.enum(["next", "prev"]),
  createdAt: z.coerce.date(),
  id: z.cuid2(),
})

export type CursorPagination = z.infer<typeof cursorPagination>

export type BaseCursorCollection<T> = {
  data: T[]
  nextCursor: string | null
  prevCursor: string | null
}

export const parseCursor = (
  cursorStr?: string | null,
): CursorPagination | null => {
  if (!cursorStr) {
    return null
  }

  const buff = Buffer.from(cursorStr, "base64")
  const cursorJSON = JSON.parse(buff.toString("ascii"))

  const { success, data } = cursorPagination.safeParse(cursorJSON)

  return success ? data : null
}
