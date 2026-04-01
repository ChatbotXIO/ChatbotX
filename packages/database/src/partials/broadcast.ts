import { z } from "zod"

export const broadcastSubactions = z.enum([
  "allContacts",
  "messengerList",
  "messengerActiveContacts",
  "messengerAccountUpdate",
  "messengerConfirmedEventUpdate",
  "messengerPostPurchaseUpdate",
  "whatsappTemplateMessage",
  "whatsappWithin24Hours",
])
export type BroadcastSubaction = z.infer<typeof broadcastSubactions>

export const broadcastFlowTypes = z.enum(["flow", "template"])
export type BroadcastFlowType = z.infer<typeof broadcastFlowTypes>
