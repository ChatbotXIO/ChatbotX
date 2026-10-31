import { isUniqueViolationError } from "@chatbotx.io/database/client"

/** How many numbered copies (`… Copy`, `… Copy 2`, …) are tried before giving up. */
export const MAX_COPY_NAME_ATTEMPTS = 50

/** Candidates actually inserted: the free ones can still lose a race to a concurrent copy. */
const COPY_NAME_INSERT_ATTEMPTS = 2

const COPY_NAME_SUFFIX = {
  /** `<name> - Copy`, `<name> - Copy 2`, … */
  dash: " - Copy",
  /** `<name> _copy`, `<name> _copy 2`, … */
  underscore: " _copy",
} as const

export type CopyNameStyle = keyof typeof COPY_NAME_SUFFIX

export type CopyNameOptions = {
  style: CopyNameStyle
  /** The resource's name limit; the base is cut so suffix and all still fit. */
  maxLength: number
}

const suffixFor = (style: CopyNameStyle, attempt: number): string =>
  attempt === 1
    ? COPY_NAME_SUFFIX[style]
    : `${COPY_NAME_SUFFIX[style]} ${attempt}`

/** The `attempt`-th copy name of `base`, cut to fit the name limit. */
export const copyName = (
  base: string,
  attempt: number,
  options: CopyNameOptions,
): string => {
  const suffix = suffixFor(options.style, attempt)
  return `${base.slice(0, options.maxLength - suffix.length)}${suffix}`
}

/**
 * The start every copy name of `base` shares, however much it was cut — what a
 * resource's "names starting with" query should look for.
 */
export const copyNamePrefix = (
  base: string,
  options: CopyNameOptions,
): string => {
  const longestSuffix = suffixFor(options.style, MAX_COPY_NAME_ATTEMPTS)
  if (base.length <= options.maxLength - longestSuffix.length) {
    // Nothing is cut, so the shared start includes the suffix: the query
    // reads copies of this name, not every name that begins like it.
    return `${base}${COPY_NAME_SUFFIX[options.style]}`
  }
  return base.slice(0, options.maxLength - longestSuffix.length)
}

/** The copy names of `base` not in `taken`, lowest number first. */
export const freeCopyNames = (
  base: string,
  taken: ReadonlySet<string>,
  options: CopyNameOptions,
): string[] =>
  Array.from({ length: MAX_COPY_NAME_ATTEMPTS }, (_, index) =>
    copyName(base, index + 1, options),
  ).filter((name) => !taken.has(name))

/**
 * Names a copy: the first free copy name that `insert` accepts. `taken` is the
 * set of existing names with the copy prefix (read it with a resource's own
 * prefix query); a name that is free there can still collide with a concurrent
 * copy, so a unique violation moves on to the next candidate. `insert` must
 * run in a savepoint when it shares a transaction — a violation aborts it
 * otherwise. Returns `undefined` when every candidate is taken; the caller
 * decides how that is reported.
 */
export const insertWithFreeCopyName = async <T>(input: {
  base: string
  taken: ReadonlySet<string>
  options: CopyNameOptions
  /** The name's unique index: only its violation means "name taken". Any unique violation when omitted. */
  constraint?: string
  insert: (name: string) => Promise<T>
}): Promise<T | undefined> => {
  const candidates = freeCopyNames(
    input.base,
    input.taken,
    input.options,
  ).slice(0, COPY_NAME_INSERT_ATTEMPTS)
  for (const name of candidates) {
    try {
      return await input.insert(name)
    } catch (error) {
      if (!isUniqueViolationError(error, input.constraint)) {
        throw error
      }
    }
  }
  return
}
