import { z } from "zod"

const sortSchema = z.array(z.object({ id: z.string(), desc: z.boolean() }))

/**
 * Mirrors `apps/builder/src/lib/pagination.ts`'s `basePaginationRequest` —
 * kept as a separate copy (not a shared import) because the contract package
 * must have zero dependency on the builder app. Any change here should be
 * mirrored there, and vice versa.
 */
export const basePaginationInput = z.object({
  page: z.coerce.number().int().min(1).nullish(),
  perPage: z.coerce.number().int().min(1).nullish(),
  sort: z.preprocess((val) => {
    if (val === undefined) {
      return
    }

    try {
      const parsedArray = sortSchema.safeParse(val)
      if (parsedArray.success) {
        return parsedArray.data
      }

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
