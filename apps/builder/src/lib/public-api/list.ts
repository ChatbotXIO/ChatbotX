import { maxLimit } from "@chatbotx.io/database/utils"
import { z } from "zod"

// The public per-page cap can never exceed the DB-level clamp
// (`getPaginationWithDefaults`/`parsePagination`), or callers would think
// they can page past rows the backend silently truncates.
export const PUBLIC_LIST_MAX_PER_PAGE = maxLimit

export const publicListRequest = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1)
    .describe("Page number, starting at 1."),
  perPage: z.coerce
    .number()
    .int()
    .min(1)
    .max(PUBLIC_LIST_MAX_PER_PAGE)
    .default(50)
    .describe(`Number of items per page, up to ${PUBLIC_LIST_MAX_PER_PAGE}.`),
})

export function withPublicPaging<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
) {
  return (schema as unknown as z.ZodObject<Omit<Shape, "page" | "perPage">>)
    .omit({ page: true, perPage: true } as never)
    .extend(publicListRequest.shape)
}

export function publicListResponse<T extends z.ZodTypeAny>(resource: T) {
  return z.object({
    data: z.array(resource),
    pageCount: z.number().int(),
  })
}

// Temporary helper for whole-table services that don't yet paginate at the
// query layer — pushes `page`/`perPage` down into an in-memory slice.
// Documented as temporary until those services take `page`/`perPage`.
export function paginateInMemory<T>(
  items: readonly T[],
  { page, perPage }: { page: number; perPage: number },
): { data: T[]; pageCount: number } {
  const start = (page - 1) * perPage
  return {
    data: items.slice(start, start + perPage),
    pageCount: Math.max(1, Math.ceil(items.length / perPage)),
  }
}
