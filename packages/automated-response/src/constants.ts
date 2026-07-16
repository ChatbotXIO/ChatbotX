import { createHash } from "node:crypto"

type FlowActionKeyEntity = string | { id: string }

const getFlowActionKeyPart = (entity: FlowActionKeyEntity): string =>
  typeof entity === "string" ? entity : entity.id

export const getKey = (props: {
  conversationId: string
  contactInboxId: string
}) =>
  `automated-response:${props.conversationId}-${props.contactInboxId}:messages`

export const getFlowActionKey = (props: {
  conversationId: FlowActionKeyEntity
  contactInboxId: FlowActionKeyEntity
  action: string
}) => {
  const actionHash = createHash("sha256")
    .update(props.action)
    .digest("hex")
    .slice(0, 16)
  const conversationId = getFlowActionKeyPart(props.conversationId)
  const contactInboxId = getFlowActionKeyPart(props.contactInboxId)

  return `automated-response:flow-action:${conversationId}-${contactInboxId}:${actionHash}`
}
