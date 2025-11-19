"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactElement } from "react"

export const BaseStepViewer = (props: {
  icon: LucideIcon
  title: string
  children?: ReactElement
}) => (
  <div className="flex w-full flex-col justify-start gap-1 break-all text-sm">
    <div className="flex items-center gap-1 font-medium">
      <props.icon className="text-yellow-500" size={16} />
      <span>{props.title}</span>
    </div>
    {props.children}
  </div>
)
