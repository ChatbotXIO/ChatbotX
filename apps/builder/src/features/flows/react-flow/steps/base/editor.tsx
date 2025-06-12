"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactElement } from "react"

export const BaseStepEditor = (props: {
  icon: LucideIcon
  title: ReactElement
  children?: ReactElement
}) => {
  return (
    <div className="rounded-lg border-2 border-dashed p-4 text-sm flex flex-col gap-1.5">
      <div className="flex w-full gap-1 items-center">
        <props.icon size={18} />
        {props.title}
      </div>
      {props.children}
    </div>
  )
}
