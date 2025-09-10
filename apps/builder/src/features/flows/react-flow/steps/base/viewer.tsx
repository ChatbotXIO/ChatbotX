"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactElement } from "react"

export const BaseStepViewer = (props: {
  icon: LucideIcon
  title: string
  children?: ReactElement
}) => {
  return (
    <div className="w-full text-sm">
      <div className="break-word flex items-center gap-1 font-medium">
        <props.icon className="text-yellow-500" size={16} />
        <span>{props.title}</span>
        {props.children}
      </div>
    </div>
  )
}
