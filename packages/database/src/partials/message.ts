import { z } from "zod"

export const senderTypes = z.enum(["bot", "contact", "system", "user", "api"])
export type SenderType = z.infer<typeof senderTypes>

export const messageTypes = z.enum(["incoming", "outgoing", "activity"])
export type MessageType = z.infer<typeof messageTypes>

export const contentTypes = z.enum(["text", "location", "refLink"])
export type ContentType = z.infer<typeof contentTypes>
