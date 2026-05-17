import { asc, desc, type SQL } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import { env } from "./keys"

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

export const getPublicUrl = (path: string) => {
  try {
    return new URL(path, env.NEXT_PUBLIC_ASSET_URL).toString()
  } catch (error) {
    console.error("Error getting attachment URL", error)
    return ""
  }
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
