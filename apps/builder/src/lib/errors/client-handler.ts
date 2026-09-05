import { toast } from "sonner"
import { getClientErrorMessage } from "@/lib/orpc/client-error"

const FALLBACK_MESSAGE = "An unexpected error occurred. Please contact admin"

export function clientErrorHandler(error: unknown) {
  toast.error(getClientErrorMessage(error, FALLBACK_MESSAGE))
}
