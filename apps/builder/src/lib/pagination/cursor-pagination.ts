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

  let cursorJSON: unknown
  try {
    cursorJSON = JSON.parse(buff.toString("utf8"))
  } catch {
    // Malformed input (not base64-encoded JSON) — treat like any other
    // invalid cursor rather than letting a raw SyntaxError escape as an
    // unhandled 500. See `toKnownOrpcError`, which only maps
    // `ChatbotXException`/`ORPCError`.
    return null
  }

  const { success, data } = cursorPagination.safeParse(cursorJSON)

  return success ? data : null
}

export const encodeCursor = (cursor: CursorPagination): string =>
  Buffer.from(JSON.stringify(cursor)).toString("base64")
