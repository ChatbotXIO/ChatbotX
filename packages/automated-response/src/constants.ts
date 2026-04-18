export const getKey = (props: {
  conversationId: string
  contactInboxId: string
}) =>
  `automated-response:${props.conversationId}-${props.contactInboxId}:messages`
