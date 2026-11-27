import { ChatbotXException } from "@chatbotx.io/business/errors"
import { logger } from "@/lib/log"

const isNotFound = (err: unknown): boolean =>
  err instanceof ChatbotXException && err.code === "notFound"

/**
 * Resolves `null` for the not-found error a page maps to `notFound()`. Any
 * other failure is logged with the structured logger and rethrown, so a real
 * outage reaches the error boundary instead of masquerading as a missing page.
 */
export const nullOnNotFound = async <T>(
  read: Promise<T>,
  context: string,
): Promise<T | null> => {
  try {
    return await read
  } catch (err) {
    if (isNotFound(err)) {
      return null
    }
    logger.error({ err }, context)
    throw err
  }
}
