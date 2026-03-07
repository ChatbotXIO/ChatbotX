import z from "zod"

const sortSchema = z.array(z.object({ id: z.string(), desc: z.boolean() }))

export const basePaginationRequest = z.object({
  page: z.coerce.number().int().min(1).nullish(),
  perPage: z.coerce.number().int().min(1).nullish(),
  sort: z.preprocess((val) => {
    if (val === undefined) {
      return undefined
    }

    try {
      const value = JSON.parse(decodeURIComponent(`${val}`))
      const { success, data } = sortSchema.safeParse(value)
      if (!success) {
        return undefined
      }
      return data
    } catch (_error) {
      return undefined
    }
  }, sortSchema.nullish()),
})
