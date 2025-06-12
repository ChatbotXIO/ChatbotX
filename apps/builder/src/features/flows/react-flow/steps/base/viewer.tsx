"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactElement } from "react"

export const BaseStepViewer = (props: {
  icon: LucideIcon
  title: ReactElement
  children?: ReactElement
}) => {
  return (
    <div className="w-full text-sm">
      <div className="flex items-center gap-1 font-medium break-all">
        <props.icon size={16} className="text-yellow-500" />
        {props.title}
        {props.children}
      </div>
    </div>
  )
}
