import { cn } from "@aha.chat/ui/lib/utils"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type { HTMLAttributes } from "react"

const messageBubbleVariant = cva("flex gap-2", {
  variants: {
    variant: {
      INCOMING: "flex self-start",
      OUTGOING: "flex flex-row-reverse self-end",
      ACTIVITY: "w-full",
    },
  },
  defaultVariants: {
    variant: "INCOMING",
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
