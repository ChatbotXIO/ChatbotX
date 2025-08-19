import type { StepType } from "@aha.chat/flow-config"
import type { LucideIcon } from "lucide-react"
import type { ReactElement } from "react"

export type MenuItem = {
  label: ReactElement
  icon: LucideIcon
  stepType: StepType | null
  children?: MenuItem[]
}
