import { ReactElement } from "react";
import { ActionType } from "../action-type";

export type MenuItem = {
  label: ReactElement,
  icon: ReactElement,
  actionType: ActionType,
  children?: MenuItem[],
}
