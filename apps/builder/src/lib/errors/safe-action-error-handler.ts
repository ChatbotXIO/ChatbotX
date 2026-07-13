import { toast } from "sonner"

export function safeActionErrorHandler({
  error,
}: {
  error: {
    serverError?: string
  }
}) {
  if (error.serverError) {
    toast.error(error.serverError)
  }
}
