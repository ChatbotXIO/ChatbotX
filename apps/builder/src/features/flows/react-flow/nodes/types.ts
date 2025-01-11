import type { ReactElement } from "react"
import type { ActionType } from "../action-type"

export type MenuItem = {
  label: ReactElement
  icon: ReactElement
  actionType: ActionType
  children?: MenuItem[]
}
