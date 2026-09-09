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
): z.ZodObject<
  Omit<Shape, "page" | "perPage"> & typeof publicListRequest.shape
> {
  // `.omit({ page: true, perPage: true })` throws "Unrecognized key" for any
  // schema whose shape lacks one of those keys — destructuring them out of
  // `.shape` instead (present or not) never throws, so a schema without
  // built-in pagination fails at compile time (missing fields) rather than
  // crashing every public route at module load.
  //
  // `.extend()`'s own overload can't merge an unresolved generic `Shape`
  // with a concrete shape — against a bare type parameter it silently
  // collapses to just the concrete (pagination) fields, so every field the
  // caller's schema added beyond `page`/`perPage` type-checks as missing at
  // every call site, public or not (reproduced with a minimal repro schema;
  // not specific to any one caller's fields). The explicit intersection
  // return type below is what actually carries the omitted schema's fields
  // through — verified caller-side field access resolves correctly with it,
  // and does not without it.
  const { page: _page, perPage: _perPage, ...rest } = schema.shape
  return z.object({
    ...rest,
    ...publicListRequest.shape,
  }) as unknown as z.ZodObject<
    Omit<Shape, "page" | "perPage"> & typeof publicListRequest.shape
  >
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
