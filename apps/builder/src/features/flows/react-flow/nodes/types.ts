import type { StepType } from "@aha.chat/flow-config"
import type { LucideIcon } from "lucide-react"

export type MenuItem = {
  label: string
  icon: LucideIcon
  stepType: StepType | null
  children?: MenuItem[]
}
