import { ZaloSdkException } from "@chatbotx.io/sdk"

export class ZaloException extends ZaloSdkException {}

/**
 * Wraps an async function with standardized error handling
 */
export const handleZaloError = async <T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ZaloException) {
      throw error
    }
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred"
    throw new ZaloException(
      `${operation} failed: ${errorMessage}`,
    ).setOriginError(error)
  }
}
