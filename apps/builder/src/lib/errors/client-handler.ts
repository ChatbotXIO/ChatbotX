import { ORPCError } from "@orpc/client"
import { toast } from "sonner"

export function clientErrorHandler(error: unknown) {
  if (error instanceof ORPCError) {
    toast.error(
      error.message || "An unexpected error occurred. Please contact admin",
    )
  } else if (error instanceof Error) {
    toast.error(error.message)
  } else {
    toast.error("An unexpected error occurred. Please contact admin")
  }
}
