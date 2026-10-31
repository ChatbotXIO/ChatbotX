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
}): Promise<{ deleted: number; failed: number }> => {
  let deleted = 0
  let failed = 0
  for (const prefix of installObjectPrefixes(
    input.workspaceId,
    input.installationId,
    input.generation,
  )) {
    const keys = await listKeys(prefix)
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
        "Template: could not delete a staged object of a failed install",
      )
    }
  }
  return { deleted, failed }
}
