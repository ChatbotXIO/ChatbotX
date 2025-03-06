import { z } from "zod"
import type { AddNotesNodeSchema } from "./nodes/add-notes/schema"
import type { SendMessageNodeSchema } from "./nodes/send-message/schema"
import type { StartFlowNodeSchema } from "@/features/flows/react-flow/nodes/start-flow/schema"
import type { WaitNodeSchema } from "@/features/flows/react-flow/nodes/wait/schema"

export enum NodeType {
  SendMessage = "SendMessage",
  StartFlow = "StartFlow",
  Actions = "Actions",
  Condition = "Condition",
  SendMail = "SendMail",
  SplitTraffic = "SplitTraffic",
  Wait = "Wait",
  LandingPage = "LandingPage",
  AddNotes = "AddNotes",
}

export enum MessageType {
  Messenger = "Messenger",
  Omnichannel = "Omnichannel",
  Whatsapp = "Whatsapp",
  Instagram = "Instagram",
  ChatWidget = "ChatWidget",
}

export const messageTypeLabels: { value: MessageType; label: string }[] = [
  { value: MessageType.Messenger, label: "Messenger" },
  { value: MessageType.Omnichannel, label: "Omnichannel" },
  { value: MessageType.Whatsapp, label: "Whatsapp" },
  { value: MessageType.Instagram, label: "Instagram" },
  { value: MessageType.ChatWidget, label: "ChatWidget" },
]

export const baseNodeSchema = z.object({
  id: z.string().cuid2(),
  type: z.nativeEnum(NodeType),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
})

export type NodeData =
  | SendMessageNodeSchema["data"]
  | AddNotesNodeSchema["data"]

export type BlockData =
  | SendMessageNodeSchema["data"]["blocks"][number]
  | StartFlowNodeSchema["data"]["blocks"][number]
  | WaitNodeSchema["data"]["blocks"][number]
