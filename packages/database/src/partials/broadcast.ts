import { z } from "zod"

export const broadcastScheduleTypes = z.enum(["now", "future"])
export type BroadcastScheduleType = z.infer<typeof broadcastScheduleTypes>

export const broadcastStatuses = z.enum(["scheduled", "sent", "sending"])
export type BroadcastStatus = z.infer<typeof broadcastStatuses>

export const broadcastSubactions = z.enum([
  "allContacts",
  "messengerActiveContacts",
  "whatsappTemplateMessage",
  "whatsappWithin24Hours",
])
export type BroadcastSubaction = z.infer<typeof broadcastSubactions>

export const broadcastFlowTypes = z.enum(["flow", "template"])
export type BroadcastFlowType = z.infer<typeof broadcastFlowTypes>
