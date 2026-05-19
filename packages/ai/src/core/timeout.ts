import { aiTimeouts } from "../constants"

export async function withAITimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)
  try {
    return await fn(controller.signal)
  } finally {
    clearTimeout(id)
  }
}
