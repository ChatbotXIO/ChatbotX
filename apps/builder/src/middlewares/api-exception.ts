import { rethrowAsORPCError } from "@/lib/errors/orpc"
import { base } from "./context"

export const APIExceptionMiddleware = base.middleware(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    throw rethrowAsORPCError(error)
  }
})
