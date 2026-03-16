import { StepType } from "@aha.chat/flow-config"
import { SiClaude, SiGooglegemini } from "@icons-pack/react-simple-icons"
import { OpenAI as OpenAIIcon } from "@lobehub/icons"
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
  Layers,
  Layers2,
  LayersPlus,
  MailIcon,
  MessageCircleMoreIcon,
  MessageCirclePlusIcon,
  MessageCircleXIcon,
  MessagesSquareIcon,
  OctagonXIcon,
  PackageOpenIcon,
  SaveIcon,
  SaveOffIcon,
  SheetIcon,
  ShuffleIcon,
  StarIcon,
  StarOffIcon,
  TagIcon,
  UserIcon,
  UserRoundXIcon,
  ZapIcon,
} from "lucide-react"
import type { MenuItem, TranslationFn } from "../types"

const sheetsMenus = (t: TranslationFn): MenuItem[] => [
  {
    label: t("flows.actions.spreadsheetGetRow"),
    icon: SheetIcon,
    stepType: StepType.spreadsheetGetRow,
  },
  {
    label: t("flows.actions.spreadsheetGetRandomRow"),
    icon: SheetIcon,
    stepType: StepType.spreadsheetGetRandomRow,
  },
  {
    label: t("flows.actions.spreadsheetUpdateRow"),
    icon: SheetIcon,
    stepType: StepType.spreadsheetUpdateRow,
  },
  {
    label: t("flows.actions.spreadsheetClearRow"),
    icon: SheetIcon,
    stepType: StepType.spreadsheetClearRow,
  },
  {
    label: t("flows.actions.spreadsheetSendData"),
    icon: SheetIcon,
    stepType: StepType.spreadsheetSendData,
  },
]

const openaiMenus = (t: TranslationFn): MenuItem[] => [
  {
    label: "OpenAI",
    icon: OpenAIIcon,
    stepType: null,
    children: [
      {
        label: t("flows.aiGenerateText.label", {
          name: "OpenAI",
        }),
        icon: OpenAIIcon,
        stepType: StepType.aiGenerateText,
        props: {
          provider: "openai",
        },
      },
    ],
  },
]

const claudeMenus = (t: TranslationFn): MenuItem[] => [
  {
    label: "Claude",
    icon: SiClaude,
    stepType: null,
    children: [
      {
        label: t("flows.aiGenerateText.label", {
          name: "Claude",
        }),
        icon: SiClaude,
        stepType: StepType.aiGenerateText,
        props: {
          provider: "claude",
        },
      },
    ],
  },
]

const geminiMenus = (t: TranslationFn): MenuItem[] => [
  {
    label: "Gemini",
    icon: SiGooglegemini,
    stepType: null,
    children: [
      {
        label: t("flows.aiGenerateText.label", {
          name: "Gemini",
        }),
        icon: SiGooglegemini,
        stepType: StepType.aiGenerateText,
        props: {
          provider: "gemini",
        },
      },
    ],
  },
]

const deepseekMenus = (t: TranslationFn): MenuItem[] => [
  {
    label: "Deepseek",
    icon: BotIcon,
    stepType: null,
    children: [
      {
        label: t("flows.aiGenerateText.label", {
          name: "Deepseek",
        }),
        icon: BotIcon,
        stepType: StepType.aiGenerateText,
        props: {
          provider: "deepseek",
        },
      },
    ],
  },
]

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
    label: t("flows.actions.sequenceActions"),
    icon: Layers,
    stepType: null,
    children: [
      {
        label: t("flows.actions.subscribeSequence"),
        icon: LayersPlus,
        stepType: StepType.subscribeSequence,
      },
      {
        label: t("flows.actions.unsubscribeSequence"),
        icon: Layers2,
        stepType: StepType.unsubscribeSequence,
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
    label: t("fields.googleSheets.label"),
    icon: SheetIcon,
    stepType: null,
    children: sheetsMenus(t),
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
  ...openaiMenus(t),
  ...geminiMenus(t),
  ...claudeMenus(t),
  ...deepseekMenus(t),
]
