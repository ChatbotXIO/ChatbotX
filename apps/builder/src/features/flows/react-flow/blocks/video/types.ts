import type { NodeBlockButton } from "@/features/flows/react-flow/blocks/button/types";

export type NodeBlockVideo= {
  id: string
  file?: File
  link?: string
  thumbnail?: string
  buttons?: NodeBlockButton[]
}
