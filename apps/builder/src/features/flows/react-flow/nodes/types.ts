import type { ReactElement } from "react"
import type { StepType } from "@aha.chat/flow-config"
import type { LucideIcon } from "lucide-react"

export type MenuItem = {
  label: ReactElement
  icon: LucideIcon
  stepType: StepType | null
  children?: MenuItem[]
}
