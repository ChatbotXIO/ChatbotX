import { authMiddleware } from "./middlewares/auth"
import { chatbotTokenMiddleware } from "./middlewares/chatbot-token"
import { base } from "./middlewares/context"

export const authorizedAPI = base.use(authMiddleware)

export const chatbotTokenAPI = base.use(chatbotTokenMiddleware)
