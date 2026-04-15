import { channelType } from "@aha.chat/database/types"
import { stepTypes } from "@chatbotx.io/flow-config"
import {
  CreditCardIcon,
  ImageIcon,
  ImagePlayIcon,
  KeyboardIcon,
  MessageSquareIcon,
  PaperclipIcon,
  PictureInPicture2Icon,
  TextIcon,
  TimerIcon,
  VideoIcon,
  Volume2Icon,
  ZapIcon,
} from "lucide-react"
import { performActionMenus } from "../perform-action/menu"
import type { MenuData, MenuItem, TranslationFn } from "../types"
import { integrationMenus } from "./menus/integration-menu"

const ALL_MENU_ITEMS = (
  t: TranslationFn,
  menuData?: MenuData,
): Record<string, MenuItem> => ({
  sendText: {
    label: t("flows.actions.sendText"),
    icon: TextIcon,
    stepType: stepTypes.enum.sendText,
  },
  sendImage: {
    label: t("flows.actions.sendImage"),
    icon: ImageIcon,
    stepType: stepTypes.enum.sendImage,
  },
  sendCard: {
    label: t("flows.actions.sendCard"),
    icon: CreditCardIcon,
    stepType: stepTypes.enum.sendCard,
  },
  sendCarousel: {
    label: t("flows.actions.sendCarousel"),
    icon: PictureInPicture2Icon,
    stepType: stepTypes.enum.sendCarousel,
  },
  sendVideo: {
    label: t("flows.actions.sendVideo"),
    icon: VideoIcon,
    stepType: stepTypes.enum.sendVideo,
  },
  getUserData: {
    label: t("flows.actions.getUserData"),
    icon: KeyboardIcon,
    stepType: stepTypes.enum.getUserData,
  },
  sendGif: {
    label: t("flows.actions.sendGif"),
    icon: ImagePlayIcon,
    stepType: stepTypes.enum.sendGif,
  },
  sendWaTemplateMessage: {
    label: t("flows.actions.sendWaTemplateMessage"),
    icon: MessageSquareIcon,
    stepType: stepTypes.enum.sendWaTemplateMessage,
    children: integrationMenus(t, menuData, channelType.whatsapp),
  },
  typing: {
    label: t("flows.actions.typing"),
    icon: TimerIcon,
    stepType: stepTypes.enum.typing,
  },
  sendFile: {
    label: t("flows.actions.sendFile"),
    icon: PaperclipIcon,
    stepType: null,
    children: [
      {
        label: t("flows.actions.sendAudio"),
        icon: Volume2Icon,
        stepType: stepTypes.enum.sendAudio,
      },
      {
        label: t("flows.actions.sendFile"),
        icon: PaperclipIcon,
        stepType: stepTypes.enum.sendFile,
      },
    ],
  },
  actions: {
    label: t("flows.actions.actions"),
    icon: ZapIcon,
    stepType: null,
    children: performActionMenus(t),
  },
})

const BASE_MENU_ORDER = [
  "sendText",
  "sendImage",
  "sendCard",
  "sendCarousel",
  "sendVideo",
  "getUserData",
  "sendGif",
  "typing",
  "sendFile",
  "actions",
] as const

const WHATSAPP_MENU_ORDER = [
  "sendText",
  "sendImage",
  "sendCard",
  "sendCarousel",
  "sendVideo",
  "getUserData",
  "sendGif",
  "sendWaTemplateMessage",
  "typing",
  "sendFile",
  "actions",
] as const

const MENU_ORDER_BY_CHANNEL: Record<string, readonly string[]> = {
  whatsapp: WHATSAPP_MENU_ORDER,
}

export const sendMessageEditorMenus = (
  t: TranslationFn,
  menuData?: MenuData,
): MenuItem[] => {
  const channel = menuData?.beforeStep?.channel
  const allMenuItems = ALL_MENU_ITEMS(t, menuData)

  const menuOrder =
    channel && MENU_ORDER_BY_CHANNEL[channel]
      ? MENU_ORDER_BY_CHANNEL[channel]
      : BASE_MENU_ORDER

  return menuOrder.map((key) => allMenuItems[key])
}

export const sendMessageEditorMenusWithButton = (
  t: TranslationFn,
): MenuItem[] => performActionMenus(t)
