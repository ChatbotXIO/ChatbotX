import z from "zod"

const sortSchema = z.array(z.object({ id: z.string(), desc: z.boolean() }))

export const basePaginationRequest = z.object({
  page: z.coerce.number().int().min(1).nullish(),
  perPage: z.coerce.number().int().min(1).nullish(),
  sort: z.preprocess((val) => {
    if (val === undefined) {
      return
    }

    try {
      const value = JSON.parse(decodeURIComponent(`${val}`))
      const { success, data } = sortSchema.safeParse(value)
      if (!success) {
        return
      }
      return data
    } catch {
      return
    }
  }, sortSchema.nullish()),
})

export const cursorPaginationRequest = z.object({
  cursor: z.string().optional(),
  perPage: z.coerce.number().int().min(1).nullish(),
  sort: z.preprocess((val) => {
    if (val === undefined) {
      return
    }

    try {
      const value = JSON.parse(decodeURIComponent(`${val}`))
      const { success, data } = sortSchema.safeParse(value)
      if (!success) {
        return
      }
      return data
    } catch {
      return
    }
  }, sortSchema.nullish()),
})

export const decodeCursor = <T>(
  encoded: string,
  schema: z.ZodSchema<T>,
): T | null => {
  try {
    const cursor = JSON.parse(Buffer.from(encoded, "base64").toString())
    const { success, data } = schema.safeParse(cursor)
    if (!success) {
      return null
    }
    return data
  } catch {
    return null
  }
}

export const encodeCursor = <T extends Record<string, unknown>>(
  cursor: T,
): string => Buffer.from(JSON.stringify(cursor)).toString("base64")
