import { ActionType } from "@/features/flows/react-flow/action-type"
import type { MenuItem } from "@/features/flows/react-flow/nodes/types"
import { T } from "@tolgee/react"
import { TextIcon } from "lucide-react"

export const sendMailEditorMenus: MenuItem[] = [
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
