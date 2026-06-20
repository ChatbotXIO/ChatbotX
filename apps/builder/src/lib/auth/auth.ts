import { createAuth } from "@chatbotx.io/auth/server"
import { onUserCreated } from "./on-user-created"

export const auth = createAuth({ onUserCreated })
