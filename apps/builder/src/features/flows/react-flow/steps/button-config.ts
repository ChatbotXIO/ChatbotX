import { type ButtonType, buttonTypes } from "@chatbotx.io/flow-config"
import {
  LinkIcon,
  type LucideIcon,
  MessageCircleIcon,
  SkipForwardIcon,
  SquareArrowOutUpRightIcon,
  ZapIcon,
} from "lucide-react"
import type { TranslationFn } from "../nodes/types"

type IButtonConfig = {
  icon: LucideIcon
  label: string
  buttonType: ButtonType
}

export const allButtonsConfig = (t: TranslationFn): IButtonConfig[] => [
  {
    buttonType: buttonTypes.enum.sendMessage,
    icon: MessageCircleIcon,
    label: t("flows.actions.sendMessage"),
  },
  {
    buttonType: buttonTypes.enum.openWebsite,
    icon: LinkIcon,
    label: t("flows.actions.openWebsite"),
  },
  {
    buttonType: buttonTypes.enum.performAction,
    icon: ZapIcon,
    label: t("flows.actions.performAction"),
  },
  {
    buttonType: buttonTypes.enum.startExternalFlow,
    icon: SquareArrowOutUpRightIcon,
    label: t("flows.actions.startExternalFlow"),
  },
  {
    buttonType: buttonTypes.enum.startExternalNode,
    icon: SkipForwardIcon,
    label: t("flows.actions.startExternalNode"),
  },
  {
    buttonType: buttonTypes.enum.startAnotherNode,
    icon: SquareArrowOutUpRightIcon,
    label: t("flows.actions.startAnotherNode"),
  },
]
