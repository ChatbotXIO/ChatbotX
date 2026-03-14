import { ModelNotfoundException } from "@aha.chat/database/errors"
import { ORPCError, onError } from "@orpc/server"
import { ChatbotXException } from "./lib/errors/exception"
import { authMiddleware } from "./middlewares/auth"
import { chatbotTokenMiddleware } from "./middlewares/chatbot-token"
import { base } from "./middlewares/context"

export const authorizedAPI = base
  .use(
    onError((error: Error) => {
      if (error.name === ChatbotXException.name) {
        throw new ORPCError((error as ChatbotXException).code, {
          message: error.message,
          status: (error as ChatbotXException).httpStatusCode || 400,
        })
      }

      if (error.name === ModelNotfoundException.name) {
        throw new ORPCError("notFound", {
          message: error.message,
          status: 404,
        })
      }
    }),
  )
  .use(authMiddleware)

export const chatbotTokenAPI = base
  .use(
    onError((error: Error) => {
      if (error.name === ChatbotXException.name) {
        throw new ORPCError((error as ChatbotXException).code, {
          message: error.message,
          status: (error as ChatbotXException).httpStatusCode || 400,
        })
      }

      if (error.name === ModelNotfoundException.name) {
        throw new ORPCError("notFound", {
          message: error.message,
          status: 404,
        })
      }
    }),
  )
  .use(chatbotTokenMiddleware)
