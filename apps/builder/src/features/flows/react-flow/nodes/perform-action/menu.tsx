import { StepType } from "@aha.chat/flow-config"
import {
  ArchiveIcon,
  BellOffIcon,
  BellRingIcon,
  BotIcon,
  CalculatorIcon,
  CircleCheckIcon,
  CircleEllipsisIcon,
  CodeIcon,
  CogIcon,
  MailIcon,
  MessageCircleMoreIcon,
  MessageCirclePlusIcon,
  MessageCircleXIcon,
  MessagesSquareIcon,
  OctagonXIcon,
  PackageOpenIcon,
  SaveIcon,
  SaveOffIcon,
  ShuffleIcon,
  StarIcon,
  StarOffIcon,
  TagIcon,
  UserIcon,
  UserRoundXIcon,
  ZapIcon,
} from "lucide-react"
import type { MenuItem, TranslationFn } from "../types"

export const performActionMenus = (t: TranslationFn): MenuItem[] => [
  {
    label: t("flows.actions.inboxActions"),
    icon: MessagesSquareIcon,
    stepType: null,
    children: [
      {
        label: t("flows.actions.transferConversationToHuman"),
        icon: UserIcon,
        stepType: StepType.disableBot,
      },
      {
        label: t("flows.actions.transferConversationToBot"),
        icon: BotIcon,
        stepType: StepType.enableBot,
      },
      {
        label: t("flows.actions.assignConversation"),
        icon: MessageCirclePlusIcon,
        stepType: StepType.assignConversation,
      },
      {
        label: t("flows.actions.autoAssignConversation"),
        icon: MessageCirclePlusIcon,
        stepType: StepType.autoAssignConversation,
      },
      {
        label: t("flows.actions.unassignConversation"),
        icon: MessageCircleXIcon,
        stepType: StepType.unassignConversation,
      },
      {
        label: t("flows.actions.followConversation"),
        icon: StarIcon,
        stepType: StepType.followConversation,
      },
      {
        label: t("flows.actions.unfollowConversation"),
        icon: StarOffIcon,
        stepType: StepType.unfollowConversation,
      },
      {
        label: t("flows.actions.archiveConversation"),
        icon: ArchiveIcon,
        stepType: StepType.archiveConversation,
      },
      {
        label: t("flows.actions.unarchiveConversation"),
        icon: PackageOpenIcon,
        stepType: StepType.unarchiveConversation,
      },
    ],
  },
  {
    label: t("flows.actions.contactActions"),
    icon: UserIcon,
    stepType: null,
    children: [
      {
        label: t("flows.actions.addContactNotes"),
        icon: MessageCircleMoreIcon,
        stepType: StepType.addContactNotes,
      },
      {
        label: t("flows.actions.addContactTag"),
        icon: TagIcon,
        stepType: StepType.addContactTag,
      },
      {
        label: t("flows.actions.removeContactTag"),
        icon: OctagonXIcon,
        stepType: StepType.removeContactTag,
      },
      {
        label: t("flows.actions.setCustomField"),
        icon: SaveIcon,
        stepType: StepType.setCustomField,
      },
      {
        label: t("flows.actions.clearCustomField"),
        icon: SaveOffIcon,
        stepType: StepType.clearCustomField,
      },
      {
        label: t("flows.actions.blockContact"),
        icon: UserRoundXIcon,
        stepType: StepType.blockContact,
      },
      {
        label: t("flows.actions.deleteContact"),
        icon: UserRoundXIcon,
        stepType: StepType.deleteContact,
      },
    ],
  },
  {
    label: t("flows.actions.broadcastActions"),
    icon: BellRingIcon,
    stepType: null,
    children: [
      {
        label: t("flows.actions.subscribeBroadcast"),
        icon: BellRingIcon,
        stepType: StepType.subscribeBroadcast,
      },
      {
        label: t("flows.actions.unsubscribeBroadcast"),
        icon: BellOffIcon,
        stepType: StepType.unsubscribeBroadcast,
      },
    ],
  },
  {
    label: t("flows.actions.emailActions"),
    icon: MailIcon,
    stepType: null,
    children: [
      {
        label: t("flows.actions.markEmailVerified"),
        icon: CircleCheckIcon,
        stepType: StepType.markEmailVerified,
      },
      {
        label: t("flows.actions.optInEmail"),
        icon: BellRingIcon,
        stepType: StepType.optInEmail,
      },
      {
        label: t("flows.actions.optOutEmail"),
        icon: BellOffIcon,
        stepType: StepType.optOutEmail,
      },
    ],
  },
  {
    label: t("flows.actions.flowActions"),
    icon: CircleEllipsisIcon,
    stepType: null,
    children: [
      {
        label: t("flows.actions.sendNode"),
        icon: ZapIcon,
        stepType: StepType.startAnotherNode,
      },
      {
        label: t("flows.actions.sendExternalFlow"),
        icon: ZapIcon,
        stepType: StepType.startExternalFlow,
      },
      {
        label: t("flows.actions.sendExternalNode"),
        icon: ZapIcon,
        stepType: StepType.startExternalNode,
      },
    ],
  },
  {
    label: t("flows.actions.tools"),
    icon: CogIcon,
    stepType: null,
    children: [
      {
        label: t("flows.actions.getDataFromJson"),
        icon: CodeIcon,
        stepType: StepType.getDataFromJson,
      },
      {
        label: t("flows.actions.formatDate"),
        icon: ZapIcon,
        stepType: StepType.formatDate,
      },
      {
        label: t("flows.actions.generateCode"),
        icon: ShuffleIcon,
        stepType: StepType.generateCode,
      },
      {
        label: t("flows.actions.countCharacters"),
        icon: CalculatorIcon,
        stepType: StepType.countCharacters,
      },
    ],
  },
]
