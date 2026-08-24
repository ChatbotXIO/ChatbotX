import { isUniqueViolationError } from "@chatbotx.io/database/client"

const MAX_RETRY_ATTEMPTS = 20

/**
 * Retries `insert` with a numeric suffix appended to whatever name field
 * `insert` closes over, on a unique-constraint violation. A pre-query
 * ("does this name already exist?") is TOCTOU-racy against a concurrent
 * insert from the same install transaction or another install running at
 * the same time — catching the real constraint violation is the only sound
 * check. Bounded by `MAX_RETRY_ATTEMPTS`; exhausting it warns and skips
 * rather than looping forever, since a template installing hundreds of
 * same-named resources is not a case worth optimizing for.
 */
export const insertWithNameRetry = async <T>(
  name: string,
  insert: (candidateName: string) => Promise<T>,
  onGiveUp: (lastAttemptedName: string) => void,
): Promise<T | undefined> => {
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    const candidateName = attempt === 0 ? name : `${name} (${attempt + 1})`
    try {
      return await insert(candidateName)
    } catch (error) {
      if (
        !isUniqueViolationError(error) ||
        attempt === MAX_RETRY_ATTEMPTS - 1
      ) {
        if (isUniqueViolationError(error)) {
          onGiveUp(candidateName)
          return
        }
        throw error
      }
    }
  }
  return
}
