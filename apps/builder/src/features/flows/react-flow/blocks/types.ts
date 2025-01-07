import type { NodeBase } from "@xyflow/react/dist/esm/types/nodes";
import type { NodeBlockText } from "@/features/flows/react-flow/blocks/text/types";
import type { NodeBlockImage } from "@/features/flows/react-flow/blocks/image/types";
import type { NodeBlockCard } from "@/features/flows/react-flow/blocks/card/types";
import type { NodeBlockVideo } from "@/features/flows/react-flow/blocks/video/types";
import type { SendMessageEditorItemType } from "@/features/flows/react-flow/nodes/send-message/menu";

export type NodeBlock = {
  id: string
  key: SendMessageEditorItemType
  text?: NodeBlockText[]
  images?: NodeBlockImage[]
  cards?: NodeBlockCard[]
  videos?: NodeBlockVideo[],
  carousel?: Record<string, unknown>[],
  audios?: Record<string, unknown>[],
  gifs?: Record<string, unknown>[],
  files?: Record<string, unknown>[]
}

export type NodeData = {
  label: string
  blocks?: NodeBlock[]
}

export type NodeBaseAhachat = Omit<NodeBase, 'data'> & {
  data: NodeData
}
