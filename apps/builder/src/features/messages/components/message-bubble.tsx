import { cn } from "@/components/lib/utils"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type { HTMLAttributes } from "react"

const messageBubbleVariant = cva("flex gap-2", {
  variants: {
    variant: {
      INCOMING: "flex self-start",
      OUTGOING: "flex self-end flex-row-reverse",
      ACTIVITY: "w-full",
    },
  },
  defaultVariants: {
    variant: "INCOMING",
  },
})

export interface MessageProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof messageBubbleVariant> {
  asChild?: boolean
}

const MessageBubble = ({
  ref,
  className,
  variant,
  asChild = false,
  ...props
}: MessageProps & {
  ref: React.RefObject<HTMLDivElement>
}) => {
  const Comp = asChild ? Slot : "div"
  return (
    <Comp
      className={cn(messageBubbleVariant({ variant, className }))}
      ref={ref}
      {...props}
    />
  )
}
MessageBubble.displayName = "MessageBubble"

export { MessageBubble, messageBubbleVariant }
