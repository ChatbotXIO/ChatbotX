import type { ReactElement } from "react"
import type { ActionType } from "../action-type"

export type MenuItem = {
  label: ReactElement
  icon: ReactElement
  actionType: ActionType
  children?: MenuItem[]
}

export type NewNodeProps = {
  id?: string,
  labelVersion: number,
  position: { x: number, y: number }
  measured?: { width: number, height: number }
}
