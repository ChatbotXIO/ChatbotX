import { HTTPError } from "ky"
import { toast } from "sonner"

export function clientErrorHandler(error: unknown) {
  if (error instanceof HTTPError) {
    try {
      const result = error.data
      toast.error(
        result.message || "An unexpected error occurred. Please contact admin",
      )
    } catch {
      toast.error("An unexpected error occurred. Please contact admin")
    }
  } else if (error instanceof Error) {
    toast.error(error.message)
  } else {
    toast.error("An unexpected error occurred. Please contact admin")
  }
}
