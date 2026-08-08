import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { type FolderType, folderTypes } from "./folder"

export const automatedResponseTypes = z.enum(["inbound", "outbound"])
export type AutomatedResponseType = z.infer<typeof automatedResponseTypes>

// Contact (inbound) and Page (outbound) keyword rules never share a folder
// namespace — each direction gets its own FolderType even though both
// still resolve to the same AutomatedResponse table.
export const automatedResponseFolderTypeByType: Record<
  AutomatedResponseType,
  FolderType
> = {
  inbound: folderTypes.enum.automatedResponse,
  outbound: folderTypes.enum.outboundAutomatedResponse,
}

// Reverse of the map above — used to re-derive the expected `type` when a
// FolderType alone is known (e.g. moving AutomatedResponse rows between
// folders), so a move can never smuggle an inbound rule into an outbound
// folder or vice versa.
export const automatedResponseTypeByFolderType: Partial<
  Record<FolderType, AutomatedResponseType>
> = {
  [folderTypes.enum.automatedResponse]: "inbound",
  [folderTypes.enum.outboundAutomatedResponse]: "outbound",
}

export const replyTypes = z.enum(["text", "flow"])
export type ReplyType = z.infer<typeof replyTypes>

export const replyMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(replyTypes.enum.text),
    text: z.string(),
  }),
  z.object({
    type: z.literal(replyTypes.enum.flow),
    flowId: zodBigintAsString(),
  }),
])
