import { stepTypes } from "@chatbotx.io/flow-config"
import { SiClaude, SiGooglegemini } from "@icons-pack/react-simple-icons"
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
import { OpenAIIcon } from "@/icons/openai"
import type { MenuItem, TranslationFn } from "../types"

const sheetsMenus = (t: TranslationFn): MenuItem[] => [
  {
    label: t("flows.actions.spreadsheetGetRow"),
    icon: SheetIcon,
    stepType: stepTypes.enum.spreadsheetGetRow,
  },
  {
    label: t("flows.actions.spreadsheetGetRandomRow"),
    icon: SheetIcon,
    stepType: stepTypes.enum.spreadsheetGetRandomRow,
  },
  {
    label: t("flows.actions.spreadsheetUpdateRow"),
    icon: SheetIcon,
    stepType: stepTypes.enum.spreadsheetUpdateRow,
  },
  {
    label: t("flows.actions.spreadsheetClearRow"),
    icon: SheetIcon,
    stepType: stepTypes.enum.spreadsheetClearRow,
  },
  {
    label: t("flows.actions.spreadsheetSendData"),
    icon: SheetIcon,
    stepType: stepTypes.enum.spreadsheetSendData,
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
        stepType: stepTypes.enum.aiGenerateText,
        props: {
          provider: "openai",
        },
      },
      {
        label: t("flows.aiGenerateImage.label", {
          name: "OpenAI",
        }),
        icon: OpenAIIcon,
        stepType: stepTypes.enum.aiGenerateImage,
        props: {
          provider: "openai",
        },
      },
      {
        label: t("flows.aiEditImage.label", {
          name: "OpenAI",
        }),
        icon: OpenAIIcon,
        stepType: stepTypes.enum.aiEditImage,
        props: {
          provider: "openai",
        },
      },
      {
        label: t("flows.aiAnalyzeImage.label", {
          name: "OpenAI",
        }),
        icon: OpenAIIcon,
        stepType: stepTypes.enum.aiAnalyzeImage,
        props: {
          provider: "openai",
        },
      },
      {
        label: t("flows.actions.aiGenerateTextAgent"),
        icon: OpenAIIcon,
        stepType: stepTypes.enum.aiGenerateTextAgent,
        props: {
          provider: "openai",
        },
      },
      {
        label: t("flows.aiExtractData.label", {
          name: "OpenAI",
        }),
        icon: OpenAIIcon,
        stepType: stepTypes.enum.aiExtractData,
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
        stepType: stepTypes.enum.aiGenerateText,
        props: {
          provider: "claude",
        },
      },
      {
        label: t("flows.aiAnalyzeImage.label", {
          name: "Claude",
        }),
        icon: SiClaude,
        stepType: stepTypes.enum.aiAnalyzeImage,
        props: {
          provider: "claude",
        },
      },
      {
        label: t("flows.actions.aiGenerateTextAgent"),
        icon: SiClaude,
        stepType: stepTypes.enum.aiGenerateTextAgent,
        props: {
          provider: "claude",
        },
      },
      {
        label: t("flows.aiExtractData.label", {
          name: "Claude",
        }),
        icon: SiClaude,
        stepType: stepTypes.enum.aiExtractData,
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
        stepType: stepTypes.enum.aiGenerateText,
        props: {
          provider: "gemini",
        },
      },
      {
        label: t("flows.aiGenerateImage.label", {
          name: "Gemini",
        }),
        icon: SiGooglegemini,
        stepType: stepTypes.enum.aiGenerateImage,
        props: {
          provider: "gemini",
        },
      },
      {
        label: t("flows.aiEditImage.label", {
          name: "Gemini",
        }),
        icon: SiGooglegemini,
        stepType: stepTypes.enum.aiEditImage,
        props: {
          provider: "gemini",
        },
      },
      {
        label: t("flows.aiAnalyzeImage.label", {
          name: "Gemini",
        }),
        icon: SiGooglegemini,
        stepType: stepTypes.enum.aiAnalyzeImage,
        props: {
          provider: "gemini",
        },
      },
      {
        label: t("flows.actions.aiGenerateTextAgent"),
        icon: SiGooglegemini,
        stepType: stepTypes.enum.aiGenerateTextAgent,
        props: {
          provider: "gemini",
        },
      },
      {
        label: t("flows.aiExtractData.label", {
          name: "Gemini",
        }),
        icon: SiGooglegemini,
        stepType: stepTypes.enum.aiExtractData,
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
        stepType: stepTypes.enum.aiGenerateText,
        props: {
          provider: "deepseek",
        },
      },
      {
        label: t("flows.actions.aiGenerateTextAgent"),
        icon: BotIcon,
        stepType: stepTypes.enum.aiGenerateTextAgent,
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
        stepType: stepTypes.enum.disableBot,
      },
      {
        label: t("flows.actions.transferConversationToBot"),
        icon: BotIcon,
        stepType: stepTypes.enum.enableBot,
      },
      {
        label: t("flows.actions.assignConversation"),
        icon: MessageCirclePlusIcon,
        stepType: stepTypes.enum.assignConversation,
      },
      {
        label: t("flows.actions.autoAssignConversation"),
        icon: MessageCirclePlusIcon,
        stepType: stepTypes.enum.autoAssignConversation,
      },
      {
        label: t("flows.actions.unassignConversation"),
        icon: MessageCircleXIcon,
        stepType: stepTypes.enum.unassignConversation,
      },
      {
        label: t("flows.actions.followConversation"),
        icon: StarIcon,
        stepType: stepTypes.enum.followConversation,
      },
      {
        label: t("flows.actions.unfollowConversation"),
        icon: StarOffIcon,
        stepType: stepTypes.enum.unfollowConversation,
      },
      {
        label: t("flows.actions.archiveConversation"),
        icon: ArchiveIcon,
        stepType: stepTypes.enum.archiveConversation,
      },
      {
        label: t("flows.actions.unarchiveConversation"),
        icon: PackageOpenIcon,
        stepType: stepTypes.enum.unarchiveConversation,
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
        stepType: stepTypes.enum.addContactNotes,
      },
      {
        label: t("flows.actions.addContactTag"),
        icon: TagIcon,
        stepType: stepTypes.enum.addContactTag,
      },
      {
        label: t("flows.actions.removeContactTag"),
        icon: OctagonXIcon,
        stepType: stepTypes.enum.removeContactTag,
      },
      {
        label: t("flows.actions.setCustomField"),
        icon: SaveIcon,
        stepType: stepTypes.enum.setCustomField,
      },
      {
        label: t("flows.actions.clearCustomField"),
        icon: SaveOffIcon,
        stepType: stepTypes.enum.clearCustomField,
      },
      {
        label: t("flows.actions.blockContact"),
        icon: UserRoundXIcon,
        stepType: stepTypes.enum.blockContact,
      },
      {
        label: t("flows.actions.deleteContact"),
        icon: UserRoundXIcon,
        stepType: stepTypes.enum.deleteContact,
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
        stepType: stepTypes.enum.subscribeBroadcast,
      },
      {
        label: t("flows.actions.unsubscribeBroadcast"),
        icon: BellOffIcon,
        stepType: stepTypes.enum.unsubscribeBroadcast,
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
        stepType: stepTypes.enum.subscribeSequence,
      },
      {
        label: t("flows.actions.unsubscribeSequence"),
        icon: Layers2,
        stepType: stepTypes.enum.unsubscribeSequence,
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
        stepType: stepTypes.enum.markEmailVerified,
      },
      {
        label: t("flows.actions.optInEmail"),
        icon: BellRingIcon,
        stepType: stepTypes.enum.optInEmail,
      },
      {
        label: t("flows.actions.optOutEmail"),
        icon: BellOffIcon,
        stepType: stepTypes.enum.optOutEmail,
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
        stepType: stepTypes.enum.startAnotherNode,
      },
      {
        label: t("flows.actions.sendExternalFlow"),
        icon: ZapIcon,
        stepType: stepTypes.enum.startExternalFlow,
      },
      {
        label: t("flows.actions.sendExternalNode"),
        icon: ZapIcon,
        stepType: stepTypes.enum.startExternalNode,
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
        stepType: stepTypes.enum.getDataFromJson,
      },
      {
        label: t("flows.actions.formatDate"),
        icon: ZapIcon,
        stepType: stepTypes.enum.formatDate,
      },
      {
        label: t("flows.actions.generateCode"),
        icon: ShuffleIcon,
        stepType: stepTypes.enum.generateCode,
      },
      {
        label: t("flows.actions.countCharacters"),
        icon: CalculatorIcon,
        stepType: stepTypes.enum.countCharacters,
      },
    ],
  },
  ...openaiMenus(t),
  ...geminiMenus(t),
  ...claudeMenus(t),
  ...deepseekMenus(t),
]
