import { isUniqueViolationError } from "@chatbotx.io/database/client"
import {
  type CopyNameOptions,
  freeCopyNames,
} from "@chatbotx.io/utils/copy-name"

// The pure naming rules live in `@chatbotx.io/utils/copy-name`, shared with
// custom-field resolution; this module adds the insert-with-retry on top.
export {
  type CopyNameOptions,
  type CopyNameStyle,
  copyName,
  copyNamePrefix,
  freeCopyNames,
  MAX_COPY_NAME_ATTEMPTS,
} from "@chatbotx.io/utils/copy-name"

/** Candidates actually inserted: the free ones can still lose a race to a concurrent copy. */
const COPY_NAME_INSERT_ATTEMPTS = 2

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
