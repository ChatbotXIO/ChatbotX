import type { Node } from "@xyflow/react"
import { z } from "zod"
import type { SendMessageNodeSchema } from "./nodes/send-message/schema"

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
  measured: z.object({
    width: z.number(),
    height: z.number(),
  }),
})

export type NodeData = SendMessageNodeSchema["data"]
// | AddNotesNodeSchema["data"]

export type FlowNode = Node<NodeData>
