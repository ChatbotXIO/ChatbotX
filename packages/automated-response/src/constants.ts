export const getKey = (props: {
  conversationId: string
  contactInboxId: string
}) => {
  return `automated-response:${props.conversationId}-${props.contactInboxId}:messages`
}
