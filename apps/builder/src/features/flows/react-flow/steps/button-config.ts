import { type ButtonType, buttonTypes } from "@chatbotx.io/flow-config"
import {
  AppWindowIcon,
  LinkIcon,
  type LucideIcon,
  MessageCircleIcon,
  PhoneCallIcon,
  SkipForwardIcon,
  SquareArrowOutUpRightIcon,
  ZapIcon,
} from "lucide-react"
import type { TranslationFn } from "../nodes/types"

type IButtonConfig = {
  icon: LucideIcon
  label: string
  buttonType: ButtonType
  /**
   * `false` hides "additional steps" in the button editor: for an action the
   * contact's device handles itself (a call) the bot is never told about the
   * tap, so steps could never run. Omitted means steps are allowed.
   */
  allowsSteps?: false
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
  {
    buttonType: buttonTypes.enum.openMiniApp,
    icon: AppWindowIcon,
    label: t("flows.actions.openMiniApp"),
  },
  {
    buttonType: buttonTypes.enum.callPhoneNumber,
    icon: PhoneCallIcon,
    label: t("flows.actions.callPhoneNumber"),
    allowsSteps: false,
  },
]
