import { toast } from "sonner"

type SafeActionError = {
  serverError?: string
}

/**
 * Shows whatever sentence the server sent, and stays quiet when it sent none.
 * Use this where the action always explains its own failures.
 */
export function safeActionErrorHandler({ error }: { error: SafeActionError }) {
  if (error.serverError) {
    toast.error(error.serverError)
  }
}

/**
 * The same, with a translated sentence for the failures that never reached the
 * server. A dropped connection or a rejected input carries no `serverError`, so
 * without a fallback the click would look like it did nothing.
 */
export function toastActionError(fallback: string) {
  return ({ error }: { error: SafeActionError }) => {
    toast.error(error.serverError ?? fallback)
  }
}
