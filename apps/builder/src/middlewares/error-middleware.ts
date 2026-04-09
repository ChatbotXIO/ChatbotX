import { ModelNotfoundException } from "@chatbotx.io/database/errors"
import { ORPCError } from "@orpc/server"
import { ChatbotXException } from "@/lib/errors/exception"
import { base } from "./context"

export const errorMiddleware = base.middleware(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    console.error("ORPC error", error)

    if (error instanceof ChatbotXException) {
      throw new ORPCError(error.code, {
        message: error.message,
        status: error.httpStatusCode || 400,
      })
    }

    if (error instanceof ModelNotfoundException) {
      throw new ORPCError("notFound", {
        message: error.message,
        status: 404,
      })
    }

    throw error
  }
})
