import { HTTPError } from "ky"
import { toast } from "sonner"

export function clientErrorHandler(error: unknown) {
  if (error instanceof HTTPError) {
    try {
      const result = error.data
      toast.error(
        result.message ||
          "Ocorreu um erro inesperado. Por favor contate o admin",
      )
    } catch {
      toast.error("Ocorreu um erro inesperado. Por favor contate o admin")
    }
  } else if (error instanceof Error) {
    toast.error(error.message)
  } else {
    toast.error("Ocorreu um erro inesperado. Por favor contate o admin")
  }
}
