import { cn } from "@aha.chat/ui/lib/utils"
import { Handle, type HandleProps, useNodeConnections } from "@xyflow/react"

export type BaseHandleProps = HandleProps & {
  onConnectedClassName?: string
}

export const BaseHandle = (
  props: BaseHandleProps & {
    type?: "source" | "target"
    ref?: React.RefObject<HTMLDivElement>
  },
) => {
  const { ref, className, onConnectedClassName, children, ...rest } = props

  const connections = useNodeConnections({
    handleType: rest.type,
    handleId: rest.id ?? "",
  })

  return (
    <Handle
      className={cn(
        "h-[11px] w-[11px] rounded-full border border-slate-300 bg-slate-400 transition dark:border-secondary dark:bg-white",
        connections.length > 0 &&
          (onConnectedClassName ?? "bg-zinc-700! dark:bg-neutral-700!"),
        className,
      )}
      {...rest}
      ref={ref}
    >
      {children}
    </Handle>
  )
}

BaseHandle.displayName = "BaseHandle"
