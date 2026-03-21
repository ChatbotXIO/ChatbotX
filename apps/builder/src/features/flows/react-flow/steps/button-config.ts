import { ButtonType } from "@chatbotx.io/flow-config"
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
    buttonType: ButtonType.SendMessage,
    icon: MessageCircleIcon,
    label: t("flows.actions.sendMessage"),
  },
  {
    buttonType: ButtonType.OpenWebsite,
    icon: LinkIcon,
    label: t("flows.actions.openWebsite"),
  },
  {
    buttonType: ButtonType.PerformAction,
    icon: ZapIcon,
    label: t("flows.actions.performAction"),
  },
  {
    buttonType: ButtonType.StartExternalFlow,
    icon: SquareArrowOutUpRightIcon,
    label: t("flows.actions.startExternalFlow"),
  },
  {
    buttonType: ButtonType.StartExternalNode,
    icon: SkipForwardIcon,
    label: t("flows.actions.startExternalNode"),
  },
  {
    buttonType: ButtonType.StartAnotherNode,
    icon: SquareArrowOutUpRightIcon,
    label: t("flows.actions.startAnotherNode"),
  },
]
