export const fetchWithTimeout = async (
  url: string | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  try {
    return await globalThis.fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "TimeoutError") {
      throw error
    }

    const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`)
    timeoutError.name = "TimeoutError"
    throw timeoutError
  }
}
