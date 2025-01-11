import { T } from "@tolgee/react"
import {
  ArchiveIcon,
  AudioLinesIcon,
  BellIcon,
  BotIcon,
  BotMessageSquareIcon,
  BotOffIcon,
  CalculatorIcon,
  CalendarSyncIcon,
  ChartNoAxesColumnIcon,
  ChartNoAxesCombinedIcon,
  CircleCheckIcon,
  CircleEllipsisIcon,
  ClockIcon,
  CodeIcon,
  CogIcon,
  CreditCardIcon,
  FileAudioIcon,
  FilterIcon,
  FilterXIcon,
  ImageIcon,
  ImagePlayIcon,
  KeyboardIcon,
  LogsIcon,
  MailIcon,
  MessageCircleMoreIcon,
  MessageCircleOffIcon,
  MessageCirclePlusIcon,
  MessageCircleXIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  OctagonXIcon,
  PackageOpenIcon,
  PaperclipIcon,
  PictureInPicture2Icon,
  SaveIcon,
  SaveOffIcon,
  ShuffleIcon,
  SpeechIcon,
  StarIcon,
  StarOffIcon,
  TagIcon,
  TextIcon,
  UserIcon,
  UserRoundMinusIcon,
  UserRoundXIcon,
  VideoIcon,
  ZapIcon,
} from "lucide-react"
import { ActionType } from "../../action-type"
import type { MenuItem } from "../types"

export const sendMessageEditorMenus: MenuItem[] = [
  {
    label: <T keyName="flows.ActionType.SendText" />,
    icon: <TextIcon />,
    actionType: ActionType.SendText,
  },
  {
    label: <T keyName="flows.ActionType.SendImage" />,
    icon: <ImageIcon />,
    actionType: ActionType.SendImage,
  },
  {
    label: <T keyName="flows.ActionType.SendCard" />,
    icon: <CreditCardIcon />,
    actionType: ActionType.SendCard,
  },
  {
    label: <T keyName="flows.ActionType.SendCarousel" />,
    icon: <PictureInPicture2Icon />,
    actionType: ActionType.SendCarousel,
  },
  {
    label: <T keyName="flows.ActionType.UserInput" />,
    icon: <KeyboardIcon />,
    actionType: ActionType.UserInput,
  },
  {
    label: <T keyName="flows.ActionType.SendVideo" />,
    icon: <VideoIcon />,
    actionType: ActionType.SendVideo,
  },
  {
    label: <T keyName="flows.ActionType.SendGif" />,
    icon: <ImagePlayIcon />,
    actionType: ActionType.SendGif,
  },
  {
    label: <T keyName="flows.ActionType.SetDebounce" />,
    icon: <ClockIcon />,
    actionType: ActionType.SetDebounce,
  },
  {
    label: <T keyName="flows.ActionType.SendFile" />,
    icon: <PaperclipIcon />,
    actionType: ActionType.SendFile,
    children: [
      {
        label: <T keyName="flows.ActionType.SendAudio" />,
        icon: <FileAudioIcon />,
        actionType: ActionType.SendAudio,
      },
      {
        label: <T keyName="flows.ActionType.SendFile" />,
        icon: <PaperclipIcon />,
        actionType: ActionType.SendFile,
      },
    ],
  },
  {
    label: <T keyName="flows.ActionType.Actions" />,
    icon: <ZapIcon />,
    actionType: ActionType.Actions,
    children: [
      {
        label: <T keyName="flows.ActionType.InboxActions" />,
        icon: <MessagesSquareIcon />,
        actionType: ActionType.InboxActions,
        children: [
          {
            label: <T keyName="flows.ActionType.UnsubscribeBot" />,
            icon: <UserIcon />,
            actionType: ActionType.UnsubscribeBot,
          },
          {
            label: <T keyName="flows.ActionType.SubscribeBot" />,
            icon: <BotIcon />,
            actionType: ActionType.SubscribeBot,
          },
          {
            label: <T keyName="flows.ActionType.AssignConversaton" />,
            icon: <MessageCirclePlusIcon />,
            actionType: ActionType.AssignConversaton,
          },
          {
            label: <T keyName="flows.ActionType.AutoAssignConversation" />,
            icon: <MessageCirclePlusIcon />,
            actionType: ActionType.AutoAssignConversation,
          },
          {
            label: <T keyName="flows.ActionType.UnassignConversation" />,
            icon: <MessageCircleXIcon />,
            actionType: ActionType.UnassignConversation,
          },
          {
            label: <T keyName="flows.ActionType.AddNotes" />,
            icon: <MessageCircleMoreIcon />,
            actionType: ActionType.AddNotes,
          },
          {
            label: <T keyName="flows.ActionType.FollowConversation" />,
            icon: <StarIcon />,
            actionType: ActionType.FollowConversation,
          },
          {
            label: <T keyName="flows.ActionType.UnfollowConversation" />,
            icon: <StarOffIcon />,
            actionType: ActionType.UnfollowConversation,
          },
          {
            label: <T keyName="flows.ActionType.ArchiveConversation" />,
            icon: <ArchiveIcon />,
            actionType: ActionType.ArchiveConversation,
          },
          {
            label: <T keyName="flows.ActionType.UnarchiveConversation" />,
            icon: <PackageOpenIcon />,
            actionType: ActionType.UnarchiveConversation,
          },
          {
            label: <T keyName="flows.ActionType.BlockContact" />,
            icon: <UserRoundMinusIcon />,
            actionType: ActionType.BlockContact,
          },
        ],
      },
      {
        label: <T keyName="flows.ActionType.AddTag" />,
        icon: <TagIcon />,
        actionType: ActionType.AddTag,
      },
      {
        label: <T keyName="flows.ActionType.RemoveTag" />,
        icon: <OctagonXIcon />,
        actionType: ActionType.RemoveTag,
      },
      {
        label: <T keyName="flows.ActionType.OpenAIActions" />,
        icon: <BotMessageSquareIcon />,
        actionType: ActionType.OpenAIActions,
        children: [
          {
            label: <T keyName="flows.ActionType.GenerateText" />,
            icon: <TextIcon />,
            actionType: ActionType.GenerateText,
          },
          {
            label: <T keyName="flows.ActionType.GenerateImage" />,
            icon: <ImageIcon />,
            actionType: ActionType.GenerateImage,
          },
          {
            label: <T keyName="flows.ActionType.AnalyzeImage" />,
            icon: <ChartNoAxesColumnIcon />,
            actionType: ActionType.AnalyzeImage,
          },
          {
            label: <T keyName="flows.ActionType.SpeechToText" />,
            icon: <TextIcon />,
            actionType: ActionType.SpeechToText,
          },
          {
            label: <T keyName="flows.ActionType.TextToSpeech" />,
            icon: <SpeechIcon />,
            actionType: ActionType.TextToSpeech,
          },
          {
            label: <T keyName="flows.ActionType.DeleteMessageHistory" />,
            icon: <MessageCircleOffIcon />,
            actionType: ActionType.DeleteMessageHistory,
          },
        ],
      },

      {
        label: <T keyName="flows.ActionType.EmailActions" />,
        icon: <MailIcon />,
        actionType: ActionType.EmailActions,
        children: [
          {
            label: <T keyName="flows.ActionType.MarkEmailVerified" />,
            icon: <CircleCheckIcon />,
            actionType: ActionType.MarkEmailVerified,
          },
          {
            label: <T keyName="flows.ActionType.OptInEmail" />,
            icon: <FilterIcon />,
            actionType: ActionType.OptInEmail,
          },
          {
            label: <T keyName="flows.ActionType.OptOutEmail" />,
            icon: <FilterXIcon />,
            actionType: ActionType.OptOutEmail,
          },
        ],
      },
      {
        label: <T keyName="flows.ActionType.MessengerActions" />,
        icon: <MessageSquareIcon />,
        actionType: ActionType.MessengerActions,
        children: [
          {
            label: <T keyName="flows.ActionType.AddMessengerCustomAudience" />,
            icon: <AudioLinesIcon />,
            actionType: ActionType.AddMessengerCustomAudience,
          },
          {
            label: <T keyName="flows.ActionType.AddMessengerRichmenu" />,
            icon: <LogsIcon />,
            actionType: ActionType.AddMessengerRichmenu,
          },
        ],
      },
      {
        label: <T keyName="flows.ActionType.NotifyAgent" />,
        icon: <BellIcon />,
        actionType: ActionType.NotifyAgent,
      },
      {
        label: <T keyName="flows.ActionType.AddCustomField" />,
        icon: <SaveIcon />,
        actionType: ActionType.AddCustomField,
      },
      {
        label: <T keyName="flows.ActionType.RemoveCustomField" />,
        icon: <SaveOffIcon />,
        actionType: ActionType.RemoveCustomField,
      },
      {
        label: <T keyName="flows.ActionType.AddCustomLog" />,
        icon: <ChartNoAxesCombinedIcon />,
        actionType: ActionType.AddCustomLog,
      },
      {
        label: <T keyName="flows.ActionType.SubscribeBot" />,
        icon: <BotIcon />,
        actionType: ActionType.SubscribeBot,
      },
      {
        label: <T keyName="flows.ActionType.UnsubscribeBot" />,
        icon: <BotOffIcon />,
        actionType: ActionType.UnsubscribeBot,
      },
      {
        label: <T keyName="flows.ActionType.RemoveContact" />,
        icon: <UserRoundXIcon />,
        actionType: ActionType.RemoveContact,
      },
      {
        label: <T keyName="flows.ActionType.CallApi" />,
        icon: <CodeIcon />,
        actionType: ActionType.CallApi,
      },
      {
        label: <T keyName="flows.ActionType.AddTrigger" />,
        icon: <ZapIcon />,
        actionType: ActionType.AddTrigger,
        children: [
          {
            label: <T keyName="flows.ActionType.TriggerZapier" />,
            icon: <ZapIcon />,
            actionType: ActionType.TriggerZapier,
          },
          {
            label: <T keyName="flows.ActionType.TriggerMake" />,
            icon: <ZapIcon />,
            actionType: ActionType.TriggerMake,
          },
          {
            label: <T keyName="flows.ActionType.TriggerPabbly" />,
            icon: <ZapIcon />,
            actionType: ActionType.TriggerPabbly,
          },
        ],
      },
      {
        label: <T keyName="flows.ActionType.Others" />,
        icon: <CircleEllipsisIcon />,
        actionType: ActionType.Others,
        children: [
          {
            label: <T keyName="flows.ActionType.StartAnotherFlow" />,
            icon: <ZapIcon />,
            actionType: ActionType.StartAnotherFlow,
          },
          {
            label: <T keyName="flows.ActionType.StartAnotherStep" />,
            icon: <ZapIcon />,
            actionType: ActionType.StartAnotherStep,
          },
          {
            label: <T keyName="flows.ActionType.StartExternalStep" />,
            icon: <ZapIcon />,
            actionType: ActionType.StartExternalStep,
          },
          {
            label: <T keyName="flows.ActionType.CancelContactInput" />,
            icon: <ZapIcon />,
            actionType: ActionType.CancelContactInput,
          },
        ],
      },
      {
        label: <T keyName="flows.ActionType.Tools" />,
        icon: <CogIcon />,
        actionType: ActionType.Tools,
        children: [
          {
            label: <T keyName="flows.ActionType.GetDataFromJson" />,
            icon: <CodeIcon />,
            actionType: ActionType.GetDataFromJson,
          },
          {
            label: <T keyName="flows.ActionType.FormatDate" />,
            icon: <CalendarSyncIcon />,
            actionType: ActionType.FormatDate,
          },
          {
            label: <T keyName="flows.ActionType.RandomCode" />,
            icon: <ShuffleIcon />,
            actionType: ActionType.RandomCode,
          },
          {
            label: <T keyName="flows.ActionType.CountCharacters" />,
            icon: <CalculatorIcon />,
            actionType: ActionType.CountCharacters,
          },
        ],
      },
    ],
  },
]
