import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"

export const cursorPagination = z.object({
  direction: z.enum(["next", "prev"]),
  createdAt: z.coerce.date(),
  id: zodBigintAsString(),
  shardId: z.string().optional(),
})

export type CursorPagination = z.infer<typeof cursorPagination>

export const decodeCursor = (
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

export const encodeCursor = (cursor: CursorPagination): string =>
  Buffer.from(JSON.stringify(cursor)).toString("base64")
