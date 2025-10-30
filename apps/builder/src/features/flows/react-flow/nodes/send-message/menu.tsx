import { StepType } from "@aha.chat/flow-config"
import {
  CreditCardIcon,
  ImageIcon,
  ImagePlayIcon,
  KeyboardIcon,
  PaperclipIcon,
  PictureInPicture2Icon,
  TextIcon,
  VideoIcon,
  Volume2Icon,
  ZapIcon,
} from "lucide-react"
import { performActionMenus } from "../perform-action/menu"
import type { MenuItem, TranslationFn } from "../types"

export const sendMessageEditorMenus = (t: TranslationFn): MenuItem[] => [
  {
    label: t("actions.sendText"),
    icon: TextIcon,
    stepType: StepType.sendText,
  },
  {
    label: t("actions.sendImage"),
    icon: ImageIcon,
    stepType: StepType.sendImage,
  },
  {
    label: t("actions.sendCard"),
    icon: CreditCardIcon,
    stepType: StepType.sendCard,
  },
  {
    label: t("actions.sendCarousel"),
    icon: PictureInPicture2Icon,
    stepType: StepType.sendCarousel,
  },
  {
    label: t("actions.sendVideo"),
    icon: VideoIcon,
    stepType: StepType.sendVideo,
  },
  {
    label: t("actions.waitUserAnswer"),
    icon: KeyboardIcon,
    stepType: StepType.waitUserReply,
  },
  {
    label: t("actions.sendGif"),
    icon: ImagePlayIcon,
    stepType: StepType.sendGif,
  },
  {
    label: t("actions.sendFile"),
    icon: PaperclipIcon,
    stepType: null,
    children: [
      {
        label: t("actions.sendAudio"),
        icon: Volume2Icon,
        stepType: StepType.sendAudio,
      },
      {
        label: t("actions.sendFile"),
        icon: PaperclipIcon,
        stepType: StepType.sendFile,
      },
    ],
  },
  {
    label: t("actions.actions"),
    icon: ZapIcon,
    stepType: null,
    children: performActionMenus(t),
  },
]

export const sendMessageEditorMenusWithButton = (
  t: TranslationFn,
): MenuItem[] => performActionMenus(t)
