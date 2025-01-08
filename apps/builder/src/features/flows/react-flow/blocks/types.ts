import type { NodeBase } from "@xyflow/react/dist/esm/types/nodes";
import type { NodeBlockText } from "@/features/flows/react-flow/blocks/text/types";
import type { NodeBlockImage } from "@/features/flows/react-flow/blocks/image/types";
import type { NodeBlockCard } from "@/features/flows/react-flow/blocks/card/types";
import type { SendMessageEditorItemType } from "@/features/flows/react-flow/nodes/send-message/menu";

export type NodeBlock = {
  id: string
  key: SendMessageEditorItemType
  text?: NodeBlockText[]
  images?: NodeBlockImage[]
  cards?: NodeBlockCard[]
  videos?: [],
  carousel?: []
}

export type NodeData = {
  label: string
  blocks?: NodeBlock[]
}

export type NodeBaseAhachat = Omit<NodeBase, 'data'> & {
  data: NodeData
}


export enum BlockType {
  Actions = "Actions",
  AddNotes = "AddNotes",
  AddTag = "AddTag",
  Archive = "Archive",
  AssignConversationToAnAdmin = "AssignConversationToAnAdmin",
  AutoAssignConversationToAnAdmin = "AutoAssignConversationToAnAdmin",
  BlockContact = "BlockContact",
  CancelPendingUserInput = "CancelPendingUserInput",
  Card = "Card",
  Carousel = "Carousel",
  CharacterCounter = "CharacterCounter",
  ClearCustomField = "ClearCustomField",
  DeleteContact = "DeleteContact",
  ExternalApiRequest = "ExternalApiRequest",
  File = "File",
  FileAudio = "FileAudio",
  FileOthers = "FileOthers",
  FindLocationsNearMe = "FindLocationsNearMe",
  FormatDate = "FormatDate",
  GenerateRandomNumberText = "GenerateRandomNumberText",
  GetDataFromJson = "GetDataFromJson",
  GetUserData = "GetUserData",
  Gif = "Gif",
  Image = "Image",
  Inbox = "Inbox",
  LogCustomEvents = "LogCustomEvents",
  MarkConversationAsFollowUp = "MarkConversationAsFollowUp",
  MoreOptions = "MoreOptions",
  NotifyAdmins = "NotifyAdmins",
  RemoveAssignment = "RemoveAssignment",
  RemoveConversationFromFollowUp = "RemoveConversationFromFollowUp",
  RemoveTag = "RemoveTag",
  SetCustomField = "SetCustomField",
  StartAnotherFlow = "StartAnotherFlow",
  StartAnotherStep = "StartAnotherStep",
  StartExternalStep = "StartExternalStep",
  SubscribeToReceiveBroadcasts = "SubscribeToReceiveBroadcasts",
  Text = "Text",
  Tools = "Tools",
  TransferConversationToBot = "TransferConversationToBot",
  TransferConversationToHuman = "TransferConversationToHuman",
  Trigger = "Trigger",
  TriggerMake = "TriggerMake",
  TriggerPabbly = "TriggerPabbly",
  TriggerZapier = "TriggerZapier",
  Typing = "Typing",
  Unarchive = "Unarchive",
  UnsubscribeFromAllBroadcast = "UnsubscribeFromAllBroadcast",
  Video = "Video",
}
