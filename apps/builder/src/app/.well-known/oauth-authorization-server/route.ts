import { getMcpAuthorizationServerMetadata } from "@chatbotx.io/auth"
import { auth } from "@/lib/auth/auth"

export const GET = getMcpAuthorizationServerMetadata(auth)
