import { whatsappMessageTemplateInternalAPIs } from "./private"
import { whatsappMessageTemplateWorkspaceTokenAPIs } from "./workspace-token"

export const whatsappMessageTemplateAPIs = {
  ...whatsappMessageTemplateInternalAPIs,
  ...whatsappMessageTemplateWorkspaceTokenAPIs,
}
