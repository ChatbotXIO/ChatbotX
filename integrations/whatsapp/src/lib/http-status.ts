/** Statuses worth one more attempt: timeout, conflict, throttling, server errors. */
export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500
}
