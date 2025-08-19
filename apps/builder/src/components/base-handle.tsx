import { cn } from "@aha.chat/ui/lib/utils"
import { Handle, type HandleProps } from "@xyflow/react"

export type BaseHandleProps = HandleProps

export const BaseHandle = (
  props: BaseHandleProps & {
    ref?: React.RefObject<HTMLDivElement>
  },
) => {
  const { ref, className, children, ...rest } = props

  return (
    <Handle
      ref={ref}
      {...rest}
      className={cn(
        "h-[11px] w-[11px] rounded-full border border-slate-300 bg-slate-100 transition dark:border-secondary dark:bg-secondary",
        className,
      )}
      {...rest}
    >
      {children}
    </Handle>
  )
}

BaseHandle.displayName = "BaseHandle"
