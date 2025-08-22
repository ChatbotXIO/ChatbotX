import { StepType } from "@aha.chat/flow-config"
import {
  ArchiveIcon,
  BellOffIcon,
  BellRingIcon,
  BotIcon,
  CalculatorIcon,
  CircleCheckIcon,
  CodeIcon,
  CogIcon,
  ImageIcon,
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
  TextIcon,
  UserIcon,
  UserRoundXIcon,
  ZapIcon,
} from "lucide-react"
import type { MenuItem } from "../types"

export const sendMessageEditorMenus: MenuItem[] = [
  {
    label: "flows.stepType.sendText",
    icon: TextIcon,
    stepType: StepType.SEND_TEXT,
  },
  {
    label: "flows.stepType.sendImage",
    icon: ImageIcon,
    stepType: StepType.SEND_IMAGE,
  },
  // {
  //   label: {t("flows.StepType.SendCard")},
  //   icon: CreditCardIcon,
  //   stepType: StepType.SendCard,
  // },
  // {
  //   label: {t("flows.StepType.SendCarousel")},
  //   icon: PictureInPicture2Icon,
  //   stepType: StepType.SendCarousel,
  // },
  // {
  //   label: {t("flows.StepType.UserInput")},
  //   icon: KeyboardIcon,
  //   stepType: StepType.UserInput,
  // },
  // {
  //   label: {t("flows.StepType.SendVideo")},
  //   icon: VideoIcon,
  //   stepType: StepType.SendVideo,
  // },
  // {
  //   label: {t("flows.StepType.SendGif")},
  //   icon: ImagePlayIcon,
  //   stepType: StepType.SendGif,
  // },
  // {
  //   label: {t("flows.StepType.SetDebounce")},
  //   icon: ClockIcon,
  //   stepType: StepType.SetDebounce,
  // },
  // {
  //   label: {t("flows.StepType.SendFile")},
  //   icon: PaperclipIcon,
  //   stepType: null,
  //   children: [
  //     {
  //       label: {t("flows.StepType.SendAudio")},
  //       icon: FileAudioIcon,
  //       stepType: StepType.SendAudio,
  //     },
  //     {
  //       label: {t("flows.StepType.SendFile")},
  //       icon: PaperclipIcon,
  //       stepType: StepType.SendFile,
  //     },
  //   ],
  // },
  {
    label: "flows.stepType.actions",
    icon: ZapIcon,
    stepType: null,
    children: [
      {
        label: "flows.stepType.inboxActions",
        icon: MessagesSquareIcon,
        stepType: null,
        children: [
          {
            label: "flows.stepType.disableBot",
            icon: UserIcon,
            stepType: StepType.DISABLE_BOT,
          },
          {
            label: "flows.stepType.enableBot",
            icon: BotIcon,
            stepType: StepType.ENABLE_BOT,
          },
          {
            label: "flows.stepType.assignConversation",
            icon: MessageCirclePlusIcon,
            stepType: StepType.ASSIGN_CONVERSATION,
          },
          {
            label: "flows.stepType.autoAssignConversation",
            icon: MessageCirclePlusIcon,
            stepType: StepType.AUTO_ASSIGN_CONVERSATION,
          },
          {
            label: "flows.stepType.unassignConversation",
            icon: MessageCircleXIcon,
            stepType: StepType.UNASSIGN_CONVERSATION,
          },
          {
            label: "flows.stepType.addContactNotes",
            icon: MessageCircleMoreIcon,
            stepType: StepType.ADD_CONTACT_NOTES,
          },
          {
            label: "flows.stepType.followConversation",
            icon: StarIcon,
            stepType: StepType.FOLLOW_CONVERSATION,
          },
          {
            label: "flows.stepType.unfollowConversation",
            icon: StarOffIcon,
            stepType: StepType.UNFOLLOW_CONVERSATION,
          },
          {
            label: "flows.stepType.archiveConversation",
            icon: ArchiveIcon,
            stepType: StepType.ARCHIVE_CONVERSATION,
          },
          {
            label: "flows.stepType.unarchiveConversation",
            icon: PackageOpenIcon,
            stepType: StepType.UNARCHIVE_CONVERSATION,
          },
          {
            label: "flows.stepType.blockContact",
            icon: UserRoundXIcon,
            stepType: StepType.BLOCK_CONTACT,
          },
        ],
      },
      {
        label: "flows.stepType.addContactTag",
        icon: TagIcon,
        stepType: StepType.ADD_CONTACT_TAG,
      },
      {
        label: "flows.stepType.removeContactTag",
        icon: OctagonXIcon,
        stepType: StepType.REMOVE_CONTACT_TAG,
      },
      //     {
      //       label: {t("flows.StepType.OpenAIActions")},
      //       icon: BotMessageSquareIcon,
      //       stepType: null,
      //       children: [
      //         {
      //           label: {t("flows.StepType.GenerateText")},
      //           icon: TextIcon,
      //           stepType: StepType.OpenAIGenerateText,
      //         },
      //         {
      //           label: {t("flows.StepType.GenerateTextAgents")},
      //           icon: TextIcon,
      //           stepType: StepType.OpenAIGenerateTextAgent,
      //         },
      //         {
      //           label: {t("flows.StepType.GenerateTextAdvanced")},
      //           icon: TextIcon,
      //           stepType: StepType.OpenAIGenerateTextAdvanced,
      //         },
      //         {
      //           label: {t("flows.StepType.GenerateTextAssistant")},
      //           icon: TextIcon,
      //           stepType: StepType.OpenAIGenerateTextAssistant,
      //         },
      //         {
      //           label: {t("flows.StepType.GenerateImage")},
      //           icon: ImageIcon,
      //           stepType: StepType.OpenAIGenerateImage,
      //         },
      //         {
      //           label: {t("flows.StepType.AnalyzeImage")},
      //           icon: ChartNoAxesColumnIcon,
      //           stepType: StepType.OpenAIAnalyzeImage,
      //         },
      //         {
      //           label: {t("flows.StepType.SpeechToText")},
      //           icon: TextIcon,
      //           stepType: StepType.OpenAISpeechToText,
      //         },
      //         {
      //           label: {t("flows.StepType.TextToSpeech")},
      //           icon: SpeechIcon,
      //           stepType: StepType.OpenAITextToSpeech,
      //         },
      // {
      //   label: {t("flows.StepType.DeleteMessageHistory")},
      //   icon: MessageCircleOffIcon,
      //   stepType: StepType.OPENAI_DELETE_MESSAGE_HISTORY,
      // },
      //       ],
      //     },

      {
        label: "flows.stepType.emailActions",
        icon: MailIcon,
        stepType: null,
        children: [
          {
            label: "flows.stepType.markEmailVerified",
            icon: CircleCheckIcon,
            stepType: StepType.MARK_EMAIL_VERIFIED,
          },
          {
            label: "flows.stepType.optInEmail",
            icon: BellRingIcon,
            stepType: StepType.OPT_IN_EMAIL,
          },
          {
            label: "flows.stepType.optOutEmail",
            icon: BellOffIcon,
            stepType: StepType.OPT_OUT_EMAIL,
          },
          //       ],
          //     },
          //     {
          //       label: {t("flows.StepType.MessengerActions")},
          //       icon: MessageSquareIcon,
          //       stepType: null,
          //       children: [
          //         {
          //           label: {t("flows.StepType.AddMessengerCustomAudience")},
          //           icon: AudioLinesIcon,
          //           stepType: StepType.AddMessengerCustomAudience,
          //         },
          //         {
          //           label: {t("flows.StepType.AddMessengerRichmenu")},
          //           icon: LogsIcon,
          //           stepType: StepType.AddMessengerRichmenu,
          //         },
        ],
      },
      //     {
      //       label: {t("flows.StepType.NotifyAgent")},
      //       icon: BellIcon,
      //       stepType: StepType.NotifyAgent,
      //     },
      {
        label: "flows.stepType.setCustomField",
        icon: SaveIcon,
        stepType: StepType.SET_CUSTOM_FIELD,
      },
      {
        label: "flows.stepType.clearCustomField",
        icon: SaveOffIcon,
        stepType: StepType.CLEAR_CUSTOM_FIELD,
      },
      //     {
      //       label: {t("flows.StepType.AddCustomLog")},
      //       icon: ChartNoAxesCombinedIcon,
      //       stepType: StepType.AddCustomLog,
      //     },
      //     {
      //       label: {t("flows.StepType.SubscribeBot")},
      //       icon: BotIcon,
      //       stepType: StepType.SubscribeBot,
      //     },
      //     {
      //       label: {t("flows.StepType.UnsubscribeBot")},
      //       icon: BotOffIcon,
      //       stepType: StepType.UnsubscribeBot,
      //     },
      {
        label: "flows.stepType.deleteContact",
        icon: UserRoundXIcon,
        stepType: StepType.DELETE_CONTACT,
      },
      //     {
      //       label: {t("flows.StepType.CallApi")},
      //       icon: CodeIcon,
      //       stepType: StepType.CallApi,
      //     },
      //     {
      //       label: {t("flows.StepType.AddTrigger")},
      //       icon: ZapIcon,
      //       stepType: null,
      //       children: [
      //         {
      //           label: {t("flows.StepType.TriggerZapier")},
      //           icon: ZapIcon,
      //           stepType: StepType.TriggerZapier,
      //         },
      //         {
      //           label: {t("flows.StepType.TriggerMake")},
      //           icon: ZapIcon,
      //           stepType: StepType.TriggerMake,
      //         },
      //         {
      //           label: {t("flows.StepType.TriggerPabbly")},
      //           icon: ZapIcon,
      //           stepType: StepType.TriggerPabbly,
      //         },
      //       ],
      //     },
      //     {
      //       label: {t("flows.StepType.Others")},
      //       icon: CircleEllipsisIcon,
      //       stepType: null,
      //       children: [
      //         {
      //           label: {t("flows.StepType.StartAnotherFlow")},
      //           icon: ZapIcon,
      //           stepType: StepType.StartAnotherFlow,
      //         },
      //         {
      //           label: {t("flows.StepType.StartAnotherStep")},
      //           icon: ZapIcon,
      //           stepType: StepType.StartAnotherStep,
      //         },
      //         {
      //           label: {t("flows.StepType.StartExternalStep")},
      //           icon: ZapIcon,
      //           stepType: StepType.StartExternalStep,
      //         },
      //         {
      //           label: {t("flows.StepType.CancelContactInput")},
      //           icon: ZapIcon,
      //           stepType: StepType.CancelContactInput,
      //         },
      //       ],
      //     },
      {
        label: "flows.stepType.tools",
        icon: CogIcon,
        stepType: null,
        children: [
          {
            label: "flows.stepType.getDataFromJson",
            icon: CodeIcon,
            stepType: StepType.GET_DATA_FROM_JSON,
          },
          {
            label: "flows.stepType.formatDate",
            icon: ZapIcon,
            stepType: StepType.FORMAT_DATE,
          },
          {
            label: "flows.stepType.generateCode",
            icon: ShuffleIcon,
            stepType: StepType.GENERATE_CODE,
          },
          {
            label: "flows.stepType.countCharacters",
            icon: CalculatorIcon,
            stepType: StepType.COUNT_CHARACTERS,
          },
        ],
      },
    ],
  },
]
