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
  CreditCardIcon,
  ImageIcon,
  MailIcon,
  MessageCircleMoreIcon,
  MessageCirclePlusIcon,
  MessageCircleXIcon,
  MessagesSquareIcon,
  OctagonXIcon,
  PackageOpenIcon,
  PaperclipIcon,
  SaveIcon,
  SaveOffIcon,
  ShuffleIcon,
  StarIcon,
  StarOffIcon,
  TagIcon,
  TextIcon,
  UserIcon,
  UserRoundXIcon,
  VideoIcon,
  Volume2Icon,
  ZapIcon,
} from "lucide-react"
import type { useTranslations } from "next-intl"

export const sendMessageEditorMenus = (
  t: ReturnType<typeof useTranslations>,
) => {
  return [
    {
      label: t("actions.sendText"),
      icon: TextIcon,
      stepType: StepType.SEND_TEXT,
    },
    {
      label: t("actions.sendImage"),
      icon: ImageIcon,
      stepType: StepType.SEND_IMAGE,
    },
    {
      label: t("actions.sendCard"),
      icon: CreditCardIcon,
      stepType: StepType.SEND_CARD,
    },
    // {
    //   label: t("actions.sendCarousel"),
    //   icon: PictureInPicture2Icon,
    //   stepType: StepType.SEND_CAROUSEL,
    // },
    // {
    //   label: t("actions.userInput"),
    //   icon: KeyboardIcon,
    //   stepType: StepType.UserInput,
    // },
    {
      label: t("actions.sendVideo"),
      icon: VideoIcon,
      stepType: StepType.SEND_VIDEO,
    },
    // {
    //   label: t("actions.sendGif"),
    //   icon: ImagePlayIcon,
    //   stepType: StepType.SendGif,
    // },
    // {
    //   label: t("actions.setDebounce"),
    //   icon: ClockIcon,
    //   stepType: StepType.SetDebounce,
    // },
    {
      label: t("actions.sendFile"),
      icon: PaperclipIcon,
      stepType: null,
      children: [
        {
          label: t("actions.sendAudio"),
          icon: Volume2Icon,
          stepType: StepType.SEND_AUDIO,
        },
        {
          label: t("actions.sendFile"),
          icon: PaperclipIcon,
          stepType: StepType.SEND_FILE,
        },
      ],
    },
    {
      label: t("actions.actions"),
      icon: ZapIcon,
      stepType: null,
      children: [
        {
          label: t("actions.inboxActions"),
          icon: MessagesSquareIcon,
          stepType: null,
          children: [
            {
              label: t("actions.disableBot"),
              icon: UserIcon,
              stepType: StepType.DISABLE_BOT,
            },
            {
              label: t("actions.enableBot"),
              icon: BotIcon,
              stepType: StepType.ENABLE_BOT,
            },
            {
              label: t("actions.assignConversation"),
              icon: MessageCirclePlusIcon,
              stepType: StepType.ASSIGN_CONVERSATION,
            },
            {
              label: t("actions.autoAssignConversation"),
              icon: MessageCirclePlusIcon,
              stepType: StepType.AUTO_ASSIGN_CONVERSATION,
            },
            {
              label: t("actions.unassignConversation"),
              icon: MessageCircleXIcon,
              stepType: StepType.UNASSIGN_CONVERSATION,
            },
            {
              label: t("actions.addContactNotes"),
              icon: MessageCircleMoreIcon,
              stepType: StepType.ADD_CONTACT_NOTES,
            },
            {
              label: t("actions.followConversation"),
              icon: StarIcon,
              stepType: StepType.FOLLOW_CONVERSATION,
            },
            {
              label: t("actions.unfollowConversation"),
              icon: StarOffIcon,
              stepType: StepType.UNFOLLOW_CONVERSATION,
            },
            {
              label: t("actions.archiveConversation"),
              icon: ArchiveIcon,
              stepType: StepType.ARCHIVE_CONVERSATION,
            },
            {
              label: t("actions.unarchiveConversation"),
              icon: PackageOpenIcon,
              stepType: StepType.UNARCHIVE_CONVERSATION,
            },
            {
              label: t("actions.blockContact"),
              icon: UserRoundXIcon,
              stepType: StepType.BLOCK_CONTACT,
            },
          ],
        },
        {
          label: t("actions.addContactTag"),
          icon: TagIcon,
          stepType: StepType.ADD_CONTACT_TAG,
        },
        {
          label: t("actions.removeContactTag"),
          icon: OctagonXIcon,
          stepType: StepType.REMOVE_CONTACT_TAG,
        },
        //     {
        //       label: t("actions.OpenAIActions"),
        //       icon: BotMessageSquareIcon,
        //       stepType: null,
        //       children: [
        //         {
        //           label: t("actions.GenerateText"),
        //           icon: TextIcon,
        //           stepType: StepType.OpenAIGenerateText,
        //         },
        //         {
        //           label: t("actions.GenerateTextAgents"),
        //           icon: TextIcon,
        //           stepType: StepType.OpenAIGenerateTextAgent,
        //         },
        //         {
        //           label: t("actions.GenerateTextAdvanced"),
        //           icon: TextIcon,
        //           stepType: StepType.OpenAIGenerateTextAdvanced,
        //         },
        //         {
        //           label: t("actions.GenerateTextAssistant"),
        //           icon: TextIcon,
        //           stepType: StepType.OpenAIGenerateTextAssistant,
        //         },
        //         {
        //           label: t("actions.GenerateImage"),
        //           icon: ImageIcon,
        //           stepType: StepType.OpenAIGenerateImage,
        //         },
        //         {
        //           label: t("actions.AnalyzeImage"),
        //           icon: ChartNoAxesColumnIcon,
        //           stepType: StepType.OpenAIAnalyzeImage,
        //         },
        //         {
        //           label: t("actions.SpeechToText"),
        //           icon: TextIcon,
        //           stepType: StepType.OpenAISpeechToText,
        //         },
        //         {
        //           label: t("actions.TextToSpeech"),
        //           icon: SpeechIcon,
        //           stepType: StepType.OpenAITextToSpeech,
        //         },
        // {
        //   label: t("actions.DeleteMessageHistory"),
        //   icon: MessageCircleOffIcon,
        //   stepType: StepType.OPENAI_DELETE_MESSAGE_HISTORY,
        // },
        //       ],
        //     },

        {
          label: t("actions.emailActions"),
          icon: MailIcon,
          stepType: null,
          children: [
            {
              label: t("actions.markEmailVerified"),
              icon: CircleCheckIcon,
              stepType: StepType.MARK_EMAIL_VERIFIED,
            },
            {
              label: t("actions.optInEmail"),
              icon: BellRingIcon,
              stepType: StepType.OPT_IN_EMAIL,
            },
            {
              label: t("actions.optOutEmail"),
              icon: BellOffIcon,
              stepType: StepType.OPT_OUT_EMAIL,
            },
            //       ],
            //     },
            //     {
            //       label: t("actions.MessengerActions"),
            //       icon: MessageSquareIcon,
            //       stepType: null,
            //       children: [
            //         {
            //           label: t("actions.AddMessengerCustomAudience"),
            //           icon: AudioLinesIcon,
            //           stepType: StepType.AddMessengerCustomAudience,
            //         },
            //         {
            //           label: t("actions.AddMessengerRichmenu"),
            //           icon: LogsIcon,
            //           stepType: StepType.AddMessengerRichmenu,
            //         },
          ],
        },
        //     {
        //       label: t("actions.NotifyAgent"),
        //       icon: BellIcon,
        //       stepType: StepType.NotifyAgent,
        //     },
        {
          label: t("actions.setCustomField"),
          icon: SaveIcon,
          stepType: StepType.SET_CUSTOM_FIELD,
        },
        {
          label: t("actions.clearCustomField"),
          icon: SaveOffIcon,
          stepType: StepType.CLEAR_CUSTOM_FIELD,
        },
        //     {
        //       label: t("actions.AddCustomLog"),
        //       icon: ChartNoAxesCombinedIcon,
        //       stepType: StepType.AddCustomLog,
        //     },
        //     {
        //       label: t("actions.SubscribeBot"),
        //       icon: BotIcon,
        //       stepType: StepType.SubscribeBot,
        //     },
        //     {
        //       label: t("actions.UnsubscribeBot"),
        //       icon: BotOffIcon,
        //       stepType: StepType.UnsubscribeBot,
        //     },
        {
          label: t("actions.deleteContact"),
          icon: UserRoundXIcon,
          stepType: StepType.DELETE_CONTACT,
        },
        //     {
        //       label: t("actions.CallApi"),
        //       icon: CodeIcon,
        //       stepType: StepType.CallApi,
        //     },
        //     {
        //       label: t("actions.AddTrigger"),
        //       icon: ZapIcon,
        //       stepType: null,
        //       children: [
        //         {
        //           label: t("actions.TriggerZapier"),
        //           icon: ZapIcon,
        //           stepType: StepType.TriggerZapier,
        //         },
        //         {
        //           label: t("actions.TriggerMake"),
        //           icon: ZapIcon,
        //           stepType: StepType.TriggerMake,
        //         },
        //         {
        //           label: t("actions.TriggerPabbly"),
        //           icon: ZapIcon,
        //           stepType: StepType.TriggerPabbly,
        //         },
        //       ],
        //     },
        //     {
        //       label: t("actions.Others"),
        //       icon: CircleEllipsisIcon,
        //       stepType: null,
        //       children: [
        //         {
        //           label: t("actions.StartAnotherFlow"),
        //           icon: ZapIcon,
        //           stepType: StepType.StartAnotherFlow,
        //         },
        //         {
        //           label: t("actions.StartAnotherStep"),
        //           icon: ZapIcon,
        //           stepType: StepType.StartAnotherStep,
        //         },
        //         {
        //           label: t("actions.StartExternalStep"),
        //           icon: ZapIcon,
        //           stepType: StepType.StartExternalStep,
        //         },
        //         {
        //           label: t("actions.CancelContactInput"),
        //           icon: ZapIcon,
        //           stepType: StepType.CancelContactInput,
        //         },
        //       ],
        //     },
        {
          label: t("actions.tools"),
          icon: CogIcon,
          stepType: null,
          children: [
            {
              label: t("actions.getDataFromJson"),
              icon: CodeIcon,
              stepType: StepType.GET_DATA_FROM_JSON,
            },
            {
              label: t("actions.formatDate"),
              icon: ZapIcon,
              stepType: StepType.FORMAT_DATE,
            },
            {
              label: t("actions.generateCode"),
              icon: ShuffleIcon,
              stepType: StepType.GENERATE_CODE,
            },
            {
              label: t("actions.countCharacters"),
              icon: CalculatorIcon,
              stepType: StepType.COUNT_CHARACTERS,
            },
          ],
        },
      ],
    },
  ]
}
