import { cn } from "@aha.chat/ui/lib/utils"
import { Handle, type HandleProps, useNodeConnections } from "@xyflow/react"

export type BaseHandleProps = HandleProps

export const BaseHandle = (
  props: BaseHandleProps & {
    type?: "source" | "target"
    ref?: React.RefObject<HTMLDivElement>
  },
) => {
  const { ref, className, children, ...rest } = props

  const connections = useNodeConnections({
    handleType: rest.type,
    handleId: rest.id ?? "",
  })

  return (
    <Handle
      className={cn(
        "h-[11px] w-[11px] rounded-full border border-slate-300 bg-slate-100 transition dark:border-secondary dark:bg-secondary",
        className,
        connections.length > 0 && "bg-zinc-700!",
      )}
      {...rest}
      ref={ref}
    >
      {children}
    </Handle>
  )
}

BaseHandle.displayName = "BaseHandle"
