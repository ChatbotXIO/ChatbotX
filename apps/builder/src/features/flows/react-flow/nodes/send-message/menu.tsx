import { StepType } from "@aha.chat/flow-config"
import {
  CreditCardIcon,
  ImageIcon,
  ImagePlayIcon,
  KeyboardIcon,
  PaperclipIcon,
  PictureInPicture2Icon,
  TextIcon,
  TimerIcon,
  VideoIcon,
  Volume2Icon,
  ZapIcon,
} from "lucide-react"
import { performActionMenus } from "../perform-action/menu"
import type { MenuItem, TranslationFn } from "../types"

export const sendMessageEditorMenus = (t: TranslationFn): MenuItem[] => [
  {
    label: t("flows.actions.sendText"),
    icon: TextIcon,
    stepType: StepType.sendText,
  },
  {
    label: t("flows.actions.sendImage"),
    icon: ImageIcon,
    stepType: StepType.sendImage,
  },
  {
    label: t("flows.actions.sendCard"),
    icon: CreditCardIcon,
    stepType: StepType.sendCard,
  },
  {
    label: t("flows.actions.sendCarousel"),
    icon: PictureInPicture2Icon,
    stepType: StepType.sendCarousel,
  },
  {
    label: t("flows.actions.sendVideo"),
    icon: VideoIcon,
    stepType: StepType.sendVideo,
  },
  {
    label: t("flows.actions.getUserData"),
    icon: KeyboardIcon,
    stepType: StepType.getUserData,
  },
  {
    label: t("flows.actions.sendGif"),
    icon: ImagePlayIcon,
    stepType: StepType.sendGif,
  },
  {
    label: t("flows.actions.typing"),
    icon: TimerIcon,
    stepType: StepType.typing,
  },
  {
    label: t("flows.actions.sendFile"),
    icon: PaperclipIcon,
    stepType: null,
    children: [
      {
        label: t("flows.actions.sendAudio"),
        icon: Volume2Icon,
        stepType: StepType.sendAudio,
      },
      {
        label: t("flows.actions.sendFile"),
        icon: PaperclipIcon,
        stepType: StepType.sendFile,
      },
    ],
  },
  {
    label: t("flows.actions.actions"),
    icon: ZapIcon,
    stepType: null,
    children: performActionMenus(t),
  },
]

export const sendMessageEditorMenusWithButton = (
  t: TranslationFn,
): MenuItem[] => performActionMenus(t)
