import { uploader } from "@chatbotx.io/filesystem"
import { mapWithConcurrency } from "@chatbotx.io/utils"
import { logger } from "../logger"
import { installObjectPrefixes } from "./template-object-keys"

const DELETE_CONCURRENCY = 4
/** Bounds one cleanup: an install stages a bounded number of objects. */
const MAX_LIST_PAGES = 20

const listKeys = async (prefix: string): Promise<string[]> => {
  const keys: string[] = []
  let continuationToken: string | undefined
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const result = await uploader.listObjects(prefix, {
      ContinuationToken: continuationToken,
    })
    for (const object of result.Contents ?? []) {
      if (object.Key?.startsWith(prefix)) {
        keys.push(object.Key)
      }
    }
    if (!(result.IsTruncated && result.NextContinuationToken)) {
      break
    }
    continuationToken = result.NextContinuationToken
  }
  return keys
}

const deleteUnderPrefixes = async (
  prefixes: readonly string[],
  keepPrefixes: readonly string[] = [],
): Promise<{ deleted: number; failed: number }> => {
  let deleted = 0
  let failed = 0
  for (const prefix of prefixes) {
    const keys = (await listKeys(prefix)).filter(
      (key) => !keepPrefixes.some((kept) => key.startsWith(kept)),
    )
    const results = await mapWithConcurrency(keys, DELETE_CONCURRENCY, (key) =>
      uploader.deleteObject(key),
    )
    for (const [index, result] of results.entries()) {
      if (result.status === "fulfilled") {
        deleted += 1
        continue
      }
      failed += 1
      logger.warn(
        { err: result.reason, path: keys[index] },
        "Template: could not delete a staged object",
      )
    }
  }
  return { deleted, failed }
}

/**
 * Deletes every object one staging generation of an installation wrote, by
 * its prefixes. A retry stages under the next generation, so this never
 * touches what a later attempt wrote. Idempotent (an empty prefix is a
 * no-op). Returns how many keys failed to delete, so the caller can decide
 * whether the generation is cleaned; a failing list throws.
 */
export const deleteInstallStagedObjects = async (input: {
  workspaceId: string
  installationId: string
  generation: number
}): Promise<{ deleted: number; failed: number }> =>
  await deleteUnderPrefixes(
    installObjectPrefixes(
      input.workspaceId,
      input.installationId,
      input.generation,
    ),
  )

/**
 * Deletes what the other attempts of a committed sync staged: a crash loses the
 * in-memory list of copied paths, and those attempts can never commit now, so
 * nothing references their objects. Only after the commit: a running attempt
 * could otherwise delete the objects of the one that took over from it. Best
 * effort: a failure only leaves files behind.
 */
export const deleteLosingSyncAttempts = async (input: {
  workspaceId: string
  installationId: string
  generation: number
  syncId: string
  winningAttemptKey: string
}): Promise<void> => {
  const roots = installObjectPrefixes(
    input.workspaceId,
    input.installationId,
    input.generation,
  )
  try {
    await deleteUnderPrefixes(
      roots.map((root) => `${root}${input.syncId}:`),
      roots.map((root) => `${root}${input.winningAttemptKey}/`),
    )
  } catch (err) {
    logger.warn(
      { err, syncId: input.syncId },
      "Template: could not list the staged objects of other sync attempts",
    )
  }
}
