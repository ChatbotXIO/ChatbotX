import { cn } from "@/components/lib/utils"
import { Handle, type HandleProps } from "@xyflow/react"
import React from "react"

export const BaseHandle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & HandleProps
>(({ className, ...props }, ref) => (
  <Handle ref={ref} className={cn("!w-3 !h-3", className)} {...props} />
))
BaseHandle.displayName = "BaseHandle"
