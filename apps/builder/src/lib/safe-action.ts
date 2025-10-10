import { Prisma, prisma } from "@aha.chat/database"
import { SdkException } from "@aha.chat/sdk"
import {
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action"
import { getAllChatbotMembers } from "@/features/chatbot-members/queries"
import { getCurrentUserId } from "@/lib/auth"
import { BaseException } from "./errors/exception"

export const actionClient = createSafeActionClient({
  handleServerError(error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return `Unique constraint failed on ${error.meta?.target ?? ""}`
      }
      if (error.code === "P2025" || error.code === "P2016") {
        return `Unable to find ${error.meta?.modelName ?? ""} record`
      }

      return error.message
    }

    if (error instanceof BaseException || error instanceof SdkException) {
      return error.message
    }

    return DEFAULT_SERVER_ERROR_MESSAGE
  },
})
// .use(async ({ next, clientInput, metadata }) => {
//   console.log("LOGGING MIDDLEWARE")

//   const startTime = performance.now()
//   const result = await next()
//   const endTime = performance.now()

//   console.log("Result ->", result)
//   console.log("Client input ->", clientInput)
//   console.log("Metadata ->", metadata)
//   console.log("Action execution took", endTime - startTime, "ms")

//   return result
// })

export const authActionClient = actionClient.use(async ({ next }) => {
  const id = await getCurrentUserId()

  const user = await prisma.user.findFirstOrThrow({
    where: { id },
  })

  return next({ ctx: { user } })
})

export const chatbotActionClient = authActionClient.use(
  async ({ bindArgsClientInputs, ctx, next }) => {
    const { user } = ctx

    const [chatbotId] = bindArgsClientInputs
    if (!chatbotId) {
      throw new Error("Chatbot not found")
    }

    const { chatbots } = await getAllChatbotMembers(user.id)
    const chatbot = chatbots.find((c) => c.id === chatbotId)
    if (!chatbot) {
      throw new Error("Chatbot not found")
    }

    return next({ ctx: { chatbot } })
  },
)
