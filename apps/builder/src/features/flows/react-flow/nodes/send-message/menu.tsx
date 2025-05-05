import { T } from "@tolgee/react"
import { ImageIcon, TextIcon } from "lucide-react"
import { StepType } from "../../steps/step-action"
import type { MenuItem } from "../types"

export const sendMessageEditorMenus: MenuItem[] = [
  {
    label: <T keyName="flows.StepType.SendText" />,
    icon: TextIcon,
    stepType: StepType.SendText,
  },
  {
    label: <T keyName="flows.StepType.SendImage" />,
    icon: ImageIcon,
    stepType: StepType.SendImage,
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
  // {
  //   label: <T keyName="flows.StepType.Actions" />,
  //   icon: ZapIcon,
  //   stepType: null,
  //   children: [
  //     {
  //       label: <T keyName="flows.StepType.InboxActions" />,
  //       icon: MessagesSquareIcon,
  //       stepType: null,
  //       children: [
  //         {
  //           label: <T keyName="flows.StepType.DisableBot" />,
  //           icon: UserIcon,
  //           stepType: StepType.DisableBot,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.EnableBot" />,
  //           icon: BotIcon,
  //           stepType: StepType.EnableBot,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.AssignConversation" />,
  //           icon: MessageCirclePlusIcon,
  //           stepType: StepType.AssignConversation,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.AutoAssignConversation" />,
  //           icon: MessageCirclePlusIcon,
  //           stepType: StepType.AutoAssignConversation,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.UnassignConversation" />,
  //           icon: MessageCircleXIcon,
  //           stepType: StepType.UnassignConversation,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.AddNote" />,
  //           icon: MessageCircleMoreIcon,
  //           stepType: StepType.AddNote,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.FollowConversation" />,
  //           icon: StarIcon,
  //           stepType: StepType.FollowConversation,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.UnfollowConversation" />,
  //           icon: StarOffIcon,
  //           stepType: StepType.UnfollowConversation,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.ArchiveConversation" />,
  //           icon: ArchiveIcon,
  //           stepType: StepType.ArchiveConversation,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.UnarchiveConversation" />,
  //           icon: PackageOpenIcon,
  //           stepType: StepType.UnarchiveConversation,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.StepContact" />,
  //           icon: UserRoundXIcon,
  //           stepType: StepType.StepContact,
  //         },
  //       ],
  //     },
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
  //         {
  //           label: <T keyName="flows.StepType.DeleteMessageHistory" />,
  //           icon: MessageCircleOffIcon,
  //           stepType: StepType.OpenAIDeleteMessageHistory,
  //         },
  //       ],
  //     },

  //     {
  //       label: <T keyName="flows.StepType.EmailActions" />,
  //       icon: MailIcon,
  //       stepType: null,
  //       children: [
  //         {
  //           label: <T keyName="flows.StepType.MarkEmailVerified" />,
  //           icon: CircleCheckIcon,
  //           stepType: StepType.MarkEmailVerified,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.OptInEmail" />,
  //           icon: BellRingIcon,
  //           stepType: StepType.OptInEmail,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.OptOutEmail" />,
  //           icon: BellOffIcon,
  //           stepType: StepType.OptOutEmail,
  //         },
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
  //       ],
  //     },
  //     {
  //       label: <T keyName="flows.StepType.NotifyAgent" />,
  //       icon: BellIcon,
  //       stepType: StepType.NotifyAgent,
  //     },
  //     {
  //       label: <T keyName="flows.StepType.AddCustomField" />,
  //       icon: SaveIcon,
  //       stepType: StepType.AddCustomField,
  //     },
  //     {
  //       label: <T keyName="flows.StepType.RemoveCustomField" />,
  //       icon: SaveOffIcon,
  //       stepType: StepType.RemoveCustomField,
  //     },
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
  //     {
  //       label: <T keyName="flows.StepType.Tools" />,
  //       icon: CogIcon,
  //       stepType: null,
  //       children: [
  //         {
  //           label: <T keyName="flows.StepType.GetDataFromJson" />,
  //           icon: CodeIcon,
  //           stepType: StepType.GetDataFromJson,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.FormatDate" />,
  //           icon: CalendarSyncIcon,
  //           stepType: StepType.FormatDate,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.RandomCode" />,
  //           icon: ShuffleIcon,
  //           stepType: StepType.RandomCode,
  //         },
  //         {
  //           label: <T keyName="flows.StepType.CountCharacters" />,
  //           icon: CalculatorIcon,
  //           stepType: StepType.CountCharacters,
  //         },
  //       ],
  //     },
  //   ],
  // },
]
