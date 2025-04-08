import type { ReactElement } from "react"
import type { StepType } from "../steps/step-action"
import type { LucideIcon } from "lucide-react"

export type MenuItem = {
  label: ReactElement
  icon: LucideIcon
  stepType: StepType | null
  children?: MenuItem[]
}

export type NewNodeProps = {
  id?: string
  labelVersion: number
  position: { x: number; y: number }
  measured?: { width: number; height: number }
}
