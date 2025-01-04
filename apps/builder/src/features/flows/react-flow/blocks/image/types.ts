import type { NodeBlockButton } from "@/features/flows/react-flow/blocks/button/types";

export type NodeBlockImage = {
  id: string
  file?: File
  link?: string
  base64?: string
  buttons?: NodeBlockButton[]
}
