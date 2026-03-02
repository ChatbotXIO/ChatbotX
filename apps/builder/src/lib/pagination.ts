import { asc, desc, type PgTable, type SQL } from "@aha.chat/database/client"

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

export const parseOrderBy = (
  modelSchema: PgTable,
  input: {
    sort?: {
      desc: boolean
      id: string
    }[]
  },
): SQL[] => {
  if (!input.sort) {
    return []
  }

  return input.sort.reduce((acc, sortItem) => {
    if (sortItem.id in modelSchema) {
      acc.push(
        sortItem.desc
          ? // biome-ignore lint/suspicious/noExplicitAny: safe cast
            desc((modelSchema as any)[sortItem.id])
          : // biome-ignore lint/suspicious/noExplicitAny: safe cast
            asc((modelSchema as any)[sortItem.id]),
      )
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
): Record<string, unknown> => {
  if (!input.sort) {
    return {}
  }

  return input.sort?.reduce(
    (acc, sortItem) => {
      if (sortItem.id in modelSchema) {
        acc[sortItem.id] = sortItem.desc ? "desc" : "asc"
      }
      return acc
    },
    {} as Record<string, unknown>,
  )
}
