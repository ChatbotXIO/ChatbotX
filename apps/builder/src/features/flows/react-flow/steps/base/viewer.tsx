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
      <div className="flex items-center gap-1 break-all font-medium">
        <props.icon className="text-yellow-500" size={16} />
        {props.title}
        {props.children}
      </div>
    </div>
  )
}
