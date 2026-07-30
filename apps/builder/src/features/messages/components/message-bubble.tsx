import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const messageBubbleVariant = cva("flex gap-2", {
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

export type MessageProps = useRender.ComponentProps<"div"> &
  VariantProps<typeof messageBubbleVariant>

const MessageBubble = ({
  className,
  variant,
  render,
  ...props
}: MessageProps) =>
  useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(
      {
        className: cn(messageBubbleVariant({ variant, className })),
      } as React.ComponentProps<"div">,
      props,
    ),
  })
MessageBubble.displayName = "MessageBubble"

export { MessageBubble, messageBubbleVariant }
