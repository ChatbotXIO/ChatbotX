"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactElement } from "react"

export const BaseStepEditor = (props: {
  icon: LucideIcon
  title: ReactElement
  children?: ReactElement
}) => {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border-2 border-dashed p-4 text-sm">
      <div className="flex w-full items-center gap-1">
        <props.icon size={18} />
        {props.title}
      </div>
      {props.children}
    </div>
  )
}
