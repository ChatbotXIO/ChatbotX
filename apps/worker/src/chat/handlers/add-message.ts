import type { Message } from "@ahachat.ai/database"

export type AddMessageHandlerProps = {
  conversationId: string
  message: Message & {
    clientId?: string
  }
}

export const addMessageHandler = async (props: AddMessageHandlerProps) => {
  console.log(props)
}
