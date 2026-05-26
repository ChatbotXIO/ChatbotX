import { cn } from "@chatbotx.io/ui/lib/utils"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type { HTMLAttributes } from "react"

// items-end (Pedro 2026-05-25 iteração 9): garante que avatar e bubble
// fiquem alinhados pelo BOTTOM em qualquer situação. Sem isso, o flex
// default (align-items: stretch) deixava o avatar `self-end` ir pro
// fundo do container — e como tinha min-h-11 (44px) no wrapper, o
// avatar ficava ABAIXO da bubble quando ela era menor que 44px (1 linha).
// Confirmado no Respond.io ao vivo: `dls-items-end` no parent + sem
// min-height na bubble = avatar sempre encosta no bottom da bubble real.
const messageBubbleVariant = cva("flex items-end gap-2", {
  variants: {
    variant: {
      left: "flex self-start",
      right: "flex flex-row-reverse self-end",
      full: "w-full",
    },
  },
  defaultVariants: {
    variant: "left",
  },
})

export type MessageProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof messageBubbleVariant> & {
    asChild?: boolean
  }

const MessageBubble = (
  props: MessageProps & {
    ref?: React.RefObject<HTMLDivElement>
  },
) => {
  const { ref, className, variant, asChild = false, ...rest } = props
  const Comp = asChild ? Slot : "div"
  return (
    <Comp
      className={cn(messageBubbleVariant({ variant, className }))}
      ref={ref}
      {...rest}
    />
  )
}
MessageBubble.displayName = "MessageBubble"

export { MessageBubble, messageBubbleVariant }
