import type { DatabaseClient } from "@chatbotx.io/database/client"
import { isUniqueViolationError } from "@chatbotx.io/database/client"
import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { escapeLikePattern } from "@chatbotx.io/database/utils"
import {
  type CopyNameStyle,
  copyNamePrefix,
  insertWithFreeCopyName,
} from "../../lib/copy-name"
import type { TemplateInstallContext } from "./types"

/** `where.name` filter for the names that start with `prefix` (LIKE-escaped). */
export const nameStartsWith = (prefix: string): { like: string } => ({
  like: `${escapeLikePattern(prefix)}%`,
})

/**
 * Names already read (or inserted) per install transaction, constraint and
 * copy prefix: an install of many colliding entries reads each prefix once and
 * learns the names it inserts itself instead of re-reading the table.
 */
const takenNamesByTx = new WeakMap<
  object,
  Map<string, Map<string, Set<string>>>
>()

const takenSetsOf = (tx: DatabaseClient, constraint: string) => {
  const byConstraint = takenNamesByTx.get(tx) ?? new Map()
  takenNamesByTx.set(tx, byConstraint)
  const byPrefix: Map<string, Set<string>> = byConstraint.get(constraint) ??
  new Map()
  byConstraint.set(constraint, byPrefix)
  return byPrefix
}

const recordInsertedName = (
  tx: DatabaseClient,
  constraint: string,
  name: string,
): void => {
  for (const [prefix, names] of takenSetsOf(tx, constraint)) {
    if (name.startsWith(prefix)) {
      names.add(name)
    }
  }
}

/**
 * Installs under the source's own name when it is free and otherwise under the
 * shared copy-name scheme (`<name> - Copy`, `<name> - Copy 2`, ...), the one
 * the rest of the product uses for duplicates. The unique index stays the
 * arbiter: each attempt runs in its own savepoint and only that constraint's
 * violation moves on, and the existing names are read once, only after the
 * plain name was refused. `onGiveUp` runs when every candidate is taken.
 */
export const insertWithCopyName = async <T>(input: {
  tx: DatabaseClient
  constraint: string
  name: string
  maxLength?: number
  style?: CopyNameStyle
  /** Existing names starting with `prefix` (use {@link nameStartsWith}). */
  loadTakenNames: (
    tx: DatabaseClient,
    prefix: string,
  ) => Promise<readonly string[]>
  insert: (tx: DatabaseClient, name: string) => Promise<T>
  onGiveUp: (name: string) => void
}): Promise<T | undefined> => {
  const attempt = async (name: string) => {
    const result = await input.tx.transaction((savepointTx) =>
      input.insert(savepointTx, name),
    )
    recordInsertedName(input.tx, input.constraint, name)
    return result
  }
  try {
    return await attempt(input.name)
  } catch (error) {
    if (!isUniqueViolationError(error, input.constraint)) {
      throw error
    }
  }
  const options = {
    style: input.style ?? "dash",
    maxLength: input.maxLength ?? 255,
  }
  const prefix = copyNamePrefix(input.name, options)
  const takenSets = takenSetsOf(input.tx, input.constraint)
  let taken = takenSets.get(prefix)
  if (!taken) {
    taken = new Set(await input.loadTakenNames(input.tx, prefix))
    takenSets.set(prefix, taken)
  }
  const created = await insertWithFreeCopyName({
    base: input.name,
    taken,
    options,
    constraint: input.constraint,
    insert: attempt,
  })
  if (created === undefined) {
    input.onGiveUp(input.name)
  }
  return created
}

/**
 * `insertWithCopyName` for a category whose rows are unique per workspace by
 * name: the existing names are read through `findTaken` (given the
 * LIKE-filter for the copy prefix) and a name nobody can take warns
 * `<category>.<sourceId>.name`, so no adapter repeats the closure.
 */
export const insertCopyNamed = <T>(
  ctx: TemplateInstallContext,
  input: {
    category: TemplateCategory
    constraint: string
    entry: { sourceId: string; name: string }
    findTaken: (
      tx: DatabaseClient,
      nameFilter: { like: string },
    ) => Promise<readonly { name: string }[]>
    insert: (tx: DatabaseClient, name: string) => Promise<T>
    maxLength?: number
    style?: CopyNameStyle
  },
): Promise<T | undefined> =>
  insertWithCopyName({
    tx: ctx.tx,
    constraint: input.constraint,
    name: input.entry.name,
    maxLength: input.maxLength,
    style: input.style,
    loadTakenNames: async (tx, prefix) =>
      (await input.findTaken(tx, nameStartsWith(prefix))).map(
        (row) => row.name,
      ),
    insert: input.insert,
    onGiveUp: (lastAttemptedName) =>
      ctx.warn({
        category: input.category,
        entityKind: "name",
        path: `${input.category}.${input.entry.sourceId}.name`,
        value: lastAttemptedName,
      }),
  })
