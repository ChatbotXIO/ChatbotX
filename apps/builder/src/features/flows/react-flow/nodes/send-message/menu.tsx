import { T } from "@tolgee/react"
import {
  ArchiveIcon,
  ImageIcon,
  MessageCircleMoreIcon,
  MessagesSquareIcon,
  SaveIcon,
  SaveOffIcon,
  TextIcon,
  ZapIcon,
  MessageCircleOffIcon,
  MessageCirclePlusIcon,
  UserRoundXIcon,
  UserIcon,
  BotIcon,
  StarIcon,
  MailIcon,
  CircleCheckIcon,
  BellRingIcon,
  BellOffIcon,
  PackageOpenIcon,
  MessageCircleXIcon,
  StarOffIcon,
  CogIcon,
  CalculatorIcon,
  ShuffleIcon,
  CodeIcon,
} from "lucide-react"
import type { MenuItem } from "../types"
import { StepType } from "@ahachat.ai/flow-config"

export const sendMessageEditorMenus: MenuItem[] = [
  {
    label: <T keyName="flows.StepType.SendText" />,
    icon: TextIcon,
    stepType: StepType.SEND_TEXT,
  },
  {
    label: <T keyName="flows.StepType.SendImage" />,
    icon: ImageIcon,
    stepType: StepType.SEND_IMAGE,
  },
  // {
  //   label: <T keyName="flows.StepType.SendCard" />,
  //   icon: CreditCardIcon,
  //   stepType: StepType.SendCard,
  // },
  // {
  //   label: <T keyName="flows.StepType.SendCarousel" />,
  //   icon: PictureInPicture2Icon,
  //   stepType: StepType.SendCarousel,
  // },
  // {
  //   label: <T keyName="flows.StepType.UserInput" />,
  //   icon: KeyboardIcon,
  //   stepType: StepType.UserInput,
  // },
  // {
  //   label: <T keyName="flows.StepType.SendVideo" />,
  //   icon: VideoIcon,
  //   stepType: StepType.SendVideo,
  // },
  // {
  //   label: <T keyName="flows.StepType.SendGif" />,
  //   icon: ImagePlayIcon,
  //   stepType: StepType.SendGif,
  // },
  // {
  //   label: <T keyName="flows.StepType.SetDebounce" />,
  //   icon: ClockIcon,
  //   stepType: StepType.SetDebounce,
  // },
  // {
  //   label: <T keyName="flows.StepType.SendFile" />,
  //   icon: PaperclipIcon,
  //   stepType: null,
  //   children: [
  //     {
  //       label: <T keyName="flows.StepType.SendAudio" />,
  //       icon: FileAudioIcon,
  //       stepType: StepType.SendAudio,
  //     },
  //     {
  //       label: <T keyName="flows.StepType.SendFile" />,
  //       icon: PaperclipIcon,
  //       stepType: StepType.SendFile,
  //     },
  //   ],
  // },
  {
    label: <T keyName="flows.StepType.Actions" />,
    icon: ZapIcon,
    stepType: null,
    children: [
      {
        label: <T keyName="flows.StepType.InboxActions" />,
        icon: MessagesSquareIcon,
        stepType: null,
        children: [
          {
            label: <T keyName="flows.StepType.DisableBot" />,
            icon: UserIcon,
            stepType: StepType.DISABLE_BOT,
          },
          {
            label: <T keyName="flows.StepType.EnableBot" />,
            icon: BotIcon,
            stepType: StepType.ENABLE_BOT,
          },
          {
            label: <T keyName="flows.StepType.AssignConversation" />,
            icon: MessageCirclePlusIcon,
            stepType: StepType.ASSIGN_CONVERSATION,
          },
          {
            label: <T keyName="flows.StepType.AutoAssignConversation" />,
            icon: MessageCirclePlusIcon,
            stepType: StepType.AUTO_ASSIGN_CONVERSATION,
          },
          {
            label: <T keyName="flows.StepType.UnassignConversation" />,
            icon: MessageCircleXIcon,
            stepType: StepType.UNASSIGN_CONVERSATION,
          },
          {
            label: <T keyName="flows.StepType.AddNotes" />,
            icon: MessageCircleMoreIcon,
            stepType: StepType.ADD_NOTES,
          },
          {
            label: <T keyName="flows.StepType.FollowConversation" />,
            icon: StarIcon,
            stepType: StepType.FOLLOW_CONVERSATION,
          },
          {
            label: <T keyName="flows.StepType.UnfollowConversation" />,
            icon: StarOffIcon,
            stepType: StepType.UNFOLLOW_CONVERSATION,
          },
          {
            label: <T keyName="flows.StepType.ArchiveConversation" />,
            icon: ArchiveIcon,
            stepType: StepType.ARCHIVE_CONVERSATION,
          },
          {
            label: <T keyName="flows.StepType.UnarchiveConversation" />,
            icon: PackageOpenIcon,
            stepType: StepType.UNARCHIVE_CONVERSATION,
          },
          {
            label: <T keyName="flows.StepType.BlockContact" />,
            icon: UserRoundXIcon,
            stepType: StepType.BLOCK_CONTACT,
          },
        ],
      },
      //     {
      //       label: <T keyName="flows.StepType.AddTag" />,
      //       icon: TagIcon,
      //       stepType: StepType.AddTag,
      //     },
      //     {
      //       label: <T keyName="flows.StepType.RemoveTag" />,
      //       icon: OctagonXIcon,
      //       stepType: StepType.RemoveTag,
      //     },
      //     {
      //       label: <T keyName="flows.StepType.OpenAIActions" />,
      //       icon: BotMessageSquareIcon,
      //       stepType: null,
      //       children: [
      //         {
      //           label: <T keyName="flows.StepType.GenerateText" />,
      //           icon: TextIcon,
      //           stepType: StepType.OpenAIGenerateText,
      //         },
      //         {
      //           label: <T keyName="flows.StepType.GenerateTextAgents" />,
      //           icon: TextIcon,
      //           stepType: StepType.OpenAIGenerateTextAgent,
      //         },
      //         {
      //           label: <T keyName="flows.StepType.GenerateTextAdvanced" />,
      //           icon: TextIcon,
      //           stepType: StepType.OpenAIGenerateTextAdvanced,
      //         },
      //         {
      //           label: <T keyName="flows.StepType.GenerateTextAssistant" />,
      //           icon: TextIcon,
      //           stepType: StepType.OpenAIGenerateTextAssistant,
      //         },
      //         {
      //           label: <T keyName="flows.StepType.GenerateImage" />,
      //           icon: ImageIcon,
      //           stepType: StepType.OpenAIGenerateImage,
      //         },
      //         {
      //           label: <T keyName="flows.StepType.AnalyzeImage" />,
      //           icon: ChartNoAxesColumnIcon,
      //           stepType: StepType.OpenAIAnalyzeImage,
      //         },
      //         {
      //           label: <T keyName="flows.StepType.SpeechToText" />,
      //           icon: TextIcon,
      //           stepType: StepType.OpenAISpeechToText,
      //         },
      //         {
      //           label: <T keyName="flows.StepType.TextToSpeech" />,
      //           icon: SpeechIcon,
      //           stepType: StepType.OpenAITextToSpeech,
      //         },
      {
        label: <T keyName="flows.StepType.DeleteMessageHistory" />,
        icon: MessageCircleOffIcon,
        stepType: StepType.OPENAI_DELETE_MESSAGE_HISTORY,
      },
      //       ],
      //     },

      {
        label: <T keyName="flows.StepType.EmailActions" />,
        icon: MailIcon,
        stepType: null,
        children: [
          {
            label: <T keyName="flows.StepType.MarkEmailVerified" />,
            icon: CircleCheckIcon,
            stepType: StepType.MARK_EMAIL_VERIFIED,
          },
          {
            label: <T keyName="flows.StepType.OptInEmail" />,
            icon: BellRingIcon,
            stepType: StepType.OPT_IN_EMAIL,
          },
          {
            label: <T keyName="flows.StepType.OptOutEmail" />,
            icon: BellOffIcon,
            stepType: StepType.OPT_OUT_EMAIL,
          },
          //       ],
          //     },
          //     {
          //       label: <T keyName="flows.StepType.MessengerActions" />,
          //       icon: MessageSquareIcon,
          //       stepType: null,
          //       children: [
          //         {
          //           label: <T keyName="flows.StepType.AddMessengerCustomAudience" />,
          //           icon: AudioLinesIcon,
          //           stepType: StepType.AddMessengerCustomAudience,
          //         },
          //         {
          //           label: <T keyName="flows.StepType.AddMessengerRichmenu" />,
          //           icon: LogsIcon,
          //           stepType: StepType.AddMessengerRichmenu,
          //         },
        ],
      },
      //     {
      //       label: <T keyName="flows.StepType.NotifyAgent" />,
      //       icon: BellIcon,
      //       stepType: StepType.NotifyAgent,
      //     },
      {
        label: <T keyName="flows.StepType.SetCustomField" />,
        icon: SaveIcon,
        stepType: StepType.SET_CUSTOM_FIELD,
      },
      {
        label: <T keyName="flows.StepType.ClearCustomField" />,
        icon: SaveOffIcon,
        stepType: StepType.CLEAR_CUSTOM_FIELD,
      },
      //     {
      //       label: <T keyName="flows.StepType.AddCustomLog" />,
      //       icon: ChartNoAxesCombinedIcon,
      //       stepType: StepType.AddCustomLog,
      //     },
      //     {
      //       label: <T keyName="flows.StepType.SubscribeBot" />,
      //       icon: BotIcon,
      //       stepType: StepType.SubscribeBot,
      //     },
      //     {
      //       label: <T keyName="flows.StepType.UnsubscribeBot" />,
      //       icon: BotOffIcon,
      //       stepType: StepType.UnsubscribeBot,
      //     },
      //     {
      //       label: <T keyName="flows.StepType.RemoveContact" />,
      //       icon: UserRoundXIcon,
      //       stepType: StepType.RemoveContact,
      //     },
      //     {
      //       label: <T keyName="flows.StepType.CallApi" />,
      //       icon: CodeIcon,
      //       stepType: StepType.CallApi,
      //     },
      //     {
      //       label: <T keyName="flows.StepType.AddTrigger" />,
      //       icon: ZapIcon,
      //       stepType: null,
      //       children: [
      //         {
      //           label: <T keyName="flows.StepType.TriggerZapier" />,
      //           icon: ZapIcon,
      //           stepType: StepType.TriggerZapier,
      //         },
      //         {
      //           label: <T keyName="flows.StepType.TriggerMake" />,
      //           icon: ZapIcon,
      //           stepType: StepType.TriggerMake,
      //         },
      //         {
      //           label: <T keyName="flows.StepType.TriggerPabbly" />,
      //           icon: ZapIcon,
      //           stepType: StepType.TriggerPabbly,
      //         },
      //       ],
      //     },
      //     {
      //       label: <T keyName="flows.StepType.Others" />,
      //       icon: CircleEllipsisIcon,
      //       stepType: null,
      //       children: [
      //         {
      //           label: <T keyName="flows.StepType.StartAnotherFlow" />,
      //           icon: ZapIcon,
      //           stepType: StepType.StartAnotherFlow,
      //         },
      //         {
      //           label: <T keyName="flows.StepType.StartAnotherStep" />,
      //           icon: ZapIcon,
      //           stepType: StepType.StartAnotherStep,
      //         },
      //         {
      //           label: <T keyName="flows.StepType.StartExternalStep" />,
      //           icon: ZapIcon,
      //           stepType: StepType.StartExternalStep,
      //         },
      //         {
      //           label: <T keyName="flows.StepType.CancelContactInput" />,
      //           icon: ZapIcon,
      //           stepType: StepType.CancelContactInput,
      //         },
      //       ],
      //     },
      {
        label: <T keyName="flows.StepType.Tools" />,
        icon: CogIcon,
        stepType: null,
        children: [
          {
            label: <T keyName="flows.StepType.GetDataFromJson" />,
            icon: CodeIcon,
            stepType: StepType.GET_DATA_FROM_JSON,
          },
          {
            label: <T keyName="flows.StepType.FormatDate" />,
            icon: ZapIcon,
            stepType: StepType.FORMAT_DATE,
          },
          {
            label: <T keyName="flows.StepType.GenerateCode" />,
            icon: ShuffleIcon,
            stepType: StepType.GENERATE_CODE,
          },
          {
            label: <T keyName="flows.StepType.CountCharacters" />,
            icon: CalculatorIcon,
            stepType: StepType.COUNT_CHARACTERS,
          },
        ],
      },
    ],
  },
]
