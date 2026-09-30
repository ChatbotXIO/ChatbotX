import { type ChannelType, channelTypes } from "@chatbotx.io/database/partials"
import {
  CHANNEL_FLOW_POLICIES,
  getChannelFlowPolicy,
  type StepType,
  stepSupport,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  CreditCardIcon,
  ImageIcon,
  ImagePlayIcon,
  ImagesIcon,
  KeyboardIcon,
  ListIcon,
  MessageSquareIcon,
  PaperclipIcon,
  PhoneIcon,
  PictureInPicture2Icon,
  TextIcon,
  TimerIcon,
  VideoIcon,
  Volume2Icon,
  WorkflowIcon,
  ZapIcon,
} from "lucide-react"
import { performActionMenus } from "../perform-action/menu"
import type { MenuData, MenuItem, TranslationFn } from "../types"
import {
  integrationMenus,
  waFlowIntegrationMenus,
} from "./menus/integration-menu"

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
  sendMultipleImages: {
    label: t("flows.actions.sendMultipleImages"),
    icon: ImagesIcon,
    stepType: stepTypes.enum.sendMultipleImages,
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
  sendTemplateMessage: {
    label: t("flows.actions.sendTemplateMessage"),
    icon: MessageSquareIcon,
    stepType: null,
    children: integrationMenus(
      t,
      menuData,
      menuData?.beforeStep?.channel as ChannelType | undefined,
    ),
  },
  whatsappFlow: {
    label: t("flows.actions.whatsappFlow"),
    icon: WorkflowIcon,
    stepType: stepTypes.enum.whatsappFlow,
    children: waFlowIntegrationMenus(t, menuData),
  },
  whatsappOptionList: {
    label: t("flows.actions.whatsappOptionList"),
    icon: ListIcon,
    stepType: stepTypes.enum.whatsappOptionList,
  },
  whatsappCallButton: {
    label: t("flows.actions.whatsappCallButton"),
    icon: PhoneIcon,
    stepType: stepTypes.enum.whatsappCallButton,
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
  "sendMultipleImages",
  "sendCard",
  "sendCarousel",
  "sendVideo",
  "getUserData",
  "sendGif",
  "sendTemplateMessage",
  "typing",
  "sendFile",
  "actions",
] as const

const WHATSAPP_MENU_EXTRAS = [
  "whatsappFlow",
  "whatsappOptionList",
  "whatsappCallButton",
] as const

const MENU_ITEM_STEP_TYPES: Record<string, readonly StepType[]> = {
  sendFile: [stepTypes.enum.sendAudio, stepTypes.enum.sendFile],
  sendTemplateMessage: [
    stepTypes.enum.sendMessengerTemplateMessage,
    stepTypes.enum.sendWaTemplateMessage,
  ],
}

const isMenuItemSupported = (props: {
  item: MenuItem
  key: string
  policy: (typeof CHANNEL_FLOW_POLICIES)[ChannelType]
}): boolean => {
  const stepTypes = props.item.stepType
    ? [props.item.stepType]
    : MENU_ITEM_STEP_TYPES[props.key]

  return (
    stepTypes === undefined ||
    stepTypes.some(
      (stepType) => props.policy.steps[stepType] !== stepSupport.unsupported,
    )
  )
}

/**
 * WhatsApp-only steps that must not be offered on omnichannel nodes: they
 * send nothing on other channels, but (unlike the option list) would still
 * persist a fully-worded outgoing message locally — a convincing phantom
 * send. The worker guards this too; hiding the menu entry prevents authoring
 * it in the first place.
 */
const OMNICHANNEL_EXCLUDED_ITEMS = new Set(["whatsappCallButton"])

export const sendMessageEditorMenus = (
  t: TranslationFn,
  menuData?: MenuData,
): MenuItem[] => {
  const channel = menuData?.beforeStep?.channel
  const policy =
    getChannelFlowPolicy(channel) ?? CHANNEL_FLOW_POLICIES.omnichannel
  const allMenuItems = ALL_MENU_ITEMS(t, menuData)
  const menuOrder =
    channel === channelTypes.enum.whatsapp ||
    channel === channelTypes.enum.omnichannel
      ? [...BASE_MENU_ORDER, ...WHATSAPP_MENU_EXTRAS]
      : BASE_MENU_ORDER

  return menuOrder.flatMap((key) => {
    if (
      channel === channelTypes.enum.omnichannel &&
      OMNICHANNEL_EXCLUDED_ITEMS.has(key)
    ) {
      return []
    }

    const item = allMenuItems[key]
    return item && isMenuItemSupported({ item, key, policy }) ? [item] : []
  })
}

export const sendMessageEditorMenusWithButton = (
  t: TranslationFn,
): MenuItem[] => performActionMenus(t)
