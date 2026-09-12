import { type AnyColumn, asc, desc, type SQL } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"

type PaginationInput = {
  page?: number | null
  perPage?: number | null
}

type PaginationOutput = {
  limit: number
  offset: number
}

export const maxLimit = 50

export const defaultPagination = {
  limit: 20,
  offset: 0,
}

export const escapeLikePattern = (value: string): string =>
  value.replace(/[\\%_]/g, "\\$&")

export const likeContains = (value: string): string =>
  `%${escapeLikePattern(value)}%`

export const parsePagination = (
  input: PaginationInput,
): PaginationOutput | null => {
  if (input.perPage) {
    const limit = Math.min(maxLimit, input.perPage)
    return {
      limit,
      offset: ((input.page ?? 1) - 1) * limit,
    }
  }

  if (input.page) {
    const limit = Math.min(maxLimit, input.perPage ?? defaultPagination.limit)
    return {
      limit,
      offset: ((input.page ?? 1) - 1) * limit,
    }
  }

  return null
}

export const getPaginationWithDefaults = (
  input: PaginationInput,
): PaginationOutput => {
  const pagination = parsePagination(input)
  if (!pagination) {
    return defaultPagination
  }
  return pagination
}

/**
 * Columns the caller permits ordering by. Omitting it accepts any column on the
 * model, which is what every caller did before this parameter existed.
 *
 * Pass one whenever the resource has a column it does not return: ordering by a
 * value the caller cannot read turns the sort into a lexicographic oracle over
 * it. Enforced here rather than by each caller pre-filtering `input.sort`, so
 * the guard lives in the mechanism every list shares.
 *
 * Deliberately opt-in, and today only `features/error-logs` opts in — it is the
 * only list that withholds a column from its own response. A list that returns
 * every column it can sort by has nothing to leak, so requiring an allow-list
 * from all ~25 callers would buy nothing and rot on the next added column.
 * Accepted on both helpers regardless of which currently has a caller: they are
 * one API over one `isSortable`, and a resource that later withholds a column
 * must not first have to widen the signature.
 */
type SortableColumns = ReadonlySet<string>

const isSortable = (
  modelSchema: PgTable,
  id: string,
  allowedColumns: SortableColumns | undefined,
): boolean =>
  id in modelSchema && (allowedColumns === undefined || allowedColumns.has(id))

export const parseOrderBy = (
  modelSchema: PgTable,
  input: {
    sort?: {
      desc: boolean
      id: string
    }[]
  },
  /** See {@link SortableColumns}. */
  allowedColumns?: SortableColumns,
): SQL[] => {
  if (!input.sort) {
    return []
  }

  return input.sort.reduce((acc, sortItem) => {
    if (isSortable(modelSchema, sortItem.id, allowedColumns)) {
      const column = (modelSchema as unknown as Record<string, unknown>)[
        sortItem.id
      ] as AnyColumn
      acc.push(sortItem.desc ? desc(column) : asc(column))
    }
    return acc
  }, [] as SQL[])
}

export const parseOrderByAsObject = (
  modelSchema: PgTable,
  input: {
    sort?:
      | {
          desc: boolean
          id: string
        }[]
      | null
  },
  /** See {@link SortableColumns}. */
  allowedColumns?: SortableColumns,
): Record<string, unknown> => {
  if (!input.sort) {
    return {}
  }

  return input.sort?.reduce(
    (acc, sortItem) => {
      if (isSortable(modelSchema, sortItem.id, allowedColumns)) {
        acc[sortItem.id] = sortItem.desc ? "desc" : "asc"
      }
      return acc
    },
    {} as Record<string, unknown>,
  )
}

type ChunkByIdOptions<T> = {
  chunkSize?: number
  callback: (records: T[]) => Promise<boolean | undefined>
}

export async function chunkById<T extends { id: string }>(
  queryBuilder: (lastId: string | null) => Promise<T[]>,
  options: ChunkByIdOptions<T>,
): Promise<void> {
  const { chunkSize = 1000, callback } = options

  let lastId: string | null = null
  let hasMore = true

  while (hasMore) {
    const records = await queryBuilder(lastId)

    if (records.length === 0) {
      break
    }

    const shouldContinue = await callback(records)

    if (shouldContinue === false) {
      break
    }

    if (records.length < chunkSize) {
      hasMore = false
    } else {
      lastId = records.at(-1)?.id ?? null
    }
  }
}
