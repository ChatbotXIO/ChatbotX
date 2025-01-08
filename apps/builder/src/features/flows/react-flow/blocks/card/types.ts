import type { NodeBlockImage } from "@/features/flows/react-flow/blocks/image/types";
import type { NodeBlockButton } from "@/features/flows/react-flow/blocks/button/types";

export type NodeBlockCard = {
  id: string
  title: string
  subtitle?: string
  imageType: 'horizontal' | 'square'
  image?: NodeBlockImage,
  buttons?: NodeBlockButton[]
}
