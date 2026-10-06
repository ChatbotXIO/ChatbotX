import { qrStyles, reflinkTypes } from "@chatbotx.io/database/partials"
import { createSelectSchema, reflinkModel } from "@chatbotx.io/database/schema"
import { z } from "zod"

// Shares the Reflink table; the chat widget settings only apply to ref links.
export const qrCodeResource = createSelectSchema(reflinkModel, {
  id: z.string(),
  flowId: z.string(),
  customFieldId: z.string().nullable(),
  workspaceId: z.string(),
  type: reflinkTypes,
  qrStyles: qrStyles.nullable(),
}).omit({ widgetAuthorizedDomains: true, widgetHiddenInboxIds: true })
export type QrCodeResource = z.infer<typeof qrCodeResource>
