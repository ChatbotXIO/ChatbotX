import type { ConversationEntity } from "@ahachat.ai/sdk"

export type TriggerMessageProps = {
  messageContent: string
  buttons: { label: string; url: string }[]
  conversation: ConversationEntity
}

export const triggerMessage = async (props: TriggerMessageProps) => {
  console.log("triggerMessage", props)
  // const inbox = await prisma.inbox.findFirstOrThrow({
  //   where: { id: props.conversation.inboxId },
  //   include: {
  //     integrationWhatsapp: true
  //   }
  // })
}
