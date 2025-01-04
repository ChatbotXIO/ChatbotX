import type { NodeBlockButton } from "@/features/flows/react-flow/blocks/button/types";

export type NodeBlockText = {
  id: string
  text: string
  buttons?: NodeBlockButton[]
}
