import { ButtonType } from "@aha.chat/flow-config"
import {
  LinkIcon,
  type LucideIcon,
  MessageCircleIcon,
  SkipForwardIcon,
  SquareArrowOutUpRightIcon,
  ZapIcon,
} from "lucide-react"

export type IButtonConfig = {
  icon: LucideIcon
  label: string
  buttonType: ButtonType
}

export const allButtonsConfig: IButtonConfig[] = [
  {
    buttonType: ButtonType.SendMessage,
    icon: MessageCircleIcon,
    label: "Send Message",
  },
  {
    buttonType: ButtonType.OPEN_WEBSITE,
    icon: LinkIcon,
    label: "Open Website",
  },
  // {
  // buttonType: ButtonType.CallPhoneNumber,
  //   icon: "phone",
  //   label: "Call Phone Number"
  // },
  {
    buttonType: ButtonType.PerformAction,
    icon: ZapIcon,
    label: "Perform Action",
  },
  {
    buttonType: ButtonType.StartAnotherFlow,
    icon: SquareArrowOutUpRightIcon,
    label: "Start Another Flow",
  },
  {
    buttonType: ButtonType.StartAnotherStep,
    icon: SkipForwardIcon,
    label: "Start Another Step",
  },
  {
    buttonType: ButtonType.StartExternalStep,
    icon: SquareArrowOutUpRightIcon,
    label: "Start External Step",
  },
]
