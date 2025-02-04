import { ActionType } from "@/features/flows/react-flow/action-type"
import { T } from "@tolgee/react"
import { TextIcon } from "lucide-react"
import type { MenuItem } from "../types"

export const landingPageEditorMenus: MenuItem[] = [
  {
    label: <T keyName="flows.ActionType.Heading" />,
    icon: <TextIcon />,
    actionType: ActionType.Heading,
  },
  {
    label: <T keyName="flows.ActionType.Spacing" />,
    icon: <TextIcon />,
    actionType: ActionType.Spacing,
  },
  {
    label: <T keyName="flows.ActionType.Text" />,
    icon: <TextIcon />,
    actionType: ActionType.Text,
  },
  {
    label: <T keyName="flows.ActionType.SingleButton" />,
    icon: <TextIcon />,
    actionType: ActionType.SingleButton,
  },
  {
    label: <T keyName="flows.ActionType.Line" />,
    icon: <TextIcon />,
    actionType: ActionType.Line,
  },
  {
    label: <T keyName="flows.ActionType.Image" />,
    icon: <TextIcon />,
    actionType: ActionType.Image,
  },
  {
    label: <T keyName="flows.ActionType.Code" />,
    icon: <TextIcon />,
    actionType: ActionType.Code,
  },
]
