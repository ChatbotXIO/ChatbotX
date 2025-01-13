import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { AddNoteBlockSchema } from "@/features/flows/react-flow/blocks/add-note/schema"
import { AddNoteBlockViewer } from "@/features/flows/react-flow/blocks/add-note/viewer"
import type { ArchiveConversationBlockSchema } from "@/features/flows/react-flow/blocks/archive-conversation/schema"
import { ArchiveConversationBlockViewer } from "@/features/flows/react-flow/blocks/archive-conversation/viewer"
import type { AssignConversationBlockSchema } from "@/features/flows/react-flow/blocks/assign-conversation/schema"
import { AssignConversationBlockViewer } from "@/features/flows/react-flow/blocks/assign-conversation/viewer"
import type { AutoAssignConversationBlockSchema } from "@/features/flows/react-flow/blocks/auto-assign-conversation/schema"
import { AutoAssignConversationBlockViewer } from "@/features/flows/react-flow/blocks/auto-assign-conversation/viewer"
import type { BlockContactBlockSchema } from "@/features/flows/react-flow/blocks/block-contact/schema"
import { BlockContactBlockViewer } from "@/features/flows/react-flow/blocks/block-contact/viewer"
import type { DisableBotBlockSchema } from "@/features/flows/react-flow/blocks/disable-bot/schema"
import { DisableBotBlockViewer } from "@/features/flows/react-flow/blocks/disable-bot/viewer"
import type { EnableBotBlockSchema } from "@/features/flows/react-flow/blocks/enable-bot/schema"
import { EnableBotBlockViewer } from "@/features/flows/react-flow/blocks/enable-bot/viewer"
import type { FollowConversationBlockSchema } from "@/features/flows/react-flow/blocks/follow-conversation/schema"
import { FollowConversationBlockViewer } from "@/features/flows/react-flow/blocks/follow-conversation/viewer"
import type { MarkEmailVerifiedBlockSchema } from "@/features/flows/react-flow/blocks/mark-email-verified/schema"
import { MarkEmailVerifiedBlockViewer } from "@/features/flows/react-flow/blocks/mark-email-verified/viewer"
import type { OptInEmailBlockSchema } from "@/features/flows/react-flow/blocks/opt-in-email/schema"
import { OptInEmailBlockViewer } from "@/features/flows/react-flow/blocks/opt-in-email/viewer"
import type { OptOutEmailBlockSchema } from "@/features/flows/react-flow/blocks/opt-out-email/schema"
import { OptOutEmailBlockViewer } from "@/features/flows/react-flow/blocks/opt-out-email/viewer"
import type { SendAudioBlockSchema } from "@/features/flows/react-flow/blocks/send-audio/schema"
import { AudioBlockViewer } from "@/features/flows/react-flow/blocks/send-audio/viewer"
import type { SendCardBlockSchema } from "@/features/flows/react-flow/blocks/send-card/schema"
import { SendCardBlockViewer } from "@/features/flows/react-flow/blocks/send-card/viewer"
import type { SendCarouselBlockSchema } from "@/features/flows/react-flow/blocks/send-carousel/schema"
import { SendCarouselBlockViewer } from "@/features/flows/react-flow/blocks/send-carousel/viewer"
import type { SendImageBlockSchema } from "@/features/flows/react-flow/blocks/send-image/schema"
import { SendImageBlockViewer } from "@/features/flows/react-flow/blocks/send-image/viewer"
import type { SendTextBlockSchema } from "@/features/flows/react-flow/blocks/send-text/schema"
import { SendTextBlockViewer } from "@/features/flows/react-flow/blocks/send-text/viewer"
import type { SendVideoBlockSchema } from "@/features/flows/react-flow/blocks/send-video/schema"
import { SendVideoBlockViewer } from "@/features/flows/react-flow/blocks/send-video/viewer"
import type { UnArchiveConversationBlockSchema } from "@/features/flows/react-flow/blocks/unarchive-conversation/schema"
import { UnArchiveConversationBlockViewer } from "@/features/flows/react-flow/blocks/unarchive-conversation/viewer"
import type { UnassignConversationBlockSchema } from "@/features/flows/react-flow/blocks/unassign-conversation/schema"
import { UnassignConversationBlockViewer } from "@/features/flows/react-flow/blocks/unassign-conversation/viewer"
import type { UnfollowConversationBlockSchema } from "@/features/flows/react-flow/blocks/unfollow-conversation/schema"
import { UnfollowConversationBlockViewer } from "@/features/flows/react-flow/blocks/unfollow-conversation/viewer"
import { MessageCircleMoreIcon } from "lucide-react"
import { type ReactNode, useState } from "react"
import { ActionType } from "../../action-type"
import { FlowFlowNodeToolbar } from "../../toolbars"
import type { SendMessageNodeSchema } from "./schema"

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const maps: Record<ActionType, (data: any) => ReactNode> = {
  [ActionType.SendText]: (data: SendTextBlockSchema) => (
    <SendTextBlockViewer key={data.id} data={data} />
  ),
  [ActionType.SendImage]: (data: SendImageBlockSchema) => (
    <SendImageBlockViewer key={data.id} data={data} />
  ),
  [ActionType.SendCard]: (data: SendCardBlockSchema) => (
    <SendCardBlockViewer key={data.id} data={data} />
  ),
  [ActionType.SendCarousel]: (data: SendCarouselBlockSchema) => (
    <SendCarouselBlockViewer key={data.id} data={data} />
  ),
  [ActionType.SendVideo]: (data: SendVideoBlockSchema) => (
    <SendVideoBlockViewer key={data.id} data={data} />
  ),
  [ActionType.SendAudio]: (data: SendAudioBlockSchema) => (
    <AudioBlockViewer key={data.id} data={data} />
  ),

  // Inbox actions
  [ActionType.DisableBot]: (data: DisableBotBlockSchema) => (
    <DisableBotBlockViewer key={data.id} />
  ),
  [ActionType.EnableBot]: (data: EnableBotBlockSchema) => (
    <EnableBotBlockViewer key={data.id} />
  ),
  [ActionType.AssignConversation]: (data: AssignConversationBlockSchema) => (
    <AssignConversationBlockViewer key={data.id} data={data} />
  ),
  [ActionType.AutoAssignConversation]: (
    data: AutoAssignConversationBlockSchema,
  ) => <AutoAssignConversationBlockViewer key={data.id} />,
  [ActionType.UnassignConversation]: (
    data: UnassignConversationBlockSchema,
  ) => <UnassignConversationBlockViewer key={data.id} />,
  [ActionType.AddNote]: (data: AddNoteBlockSchema) => (
    <AddNoteBlockViewer key={data.id} data={data} />
  ),
  [ActionType.FollowConversation]: (data: FollowConversationBlockSchema) => (
    <FollowConversationBlockViewer key={data.id} />
  ),
  [ActionType.UnfollowConversation]: (
    data: UnfollowConversationBlockSchema,
  ) => <UnfollowConversationBlockViewer key={data.id} />,
  [ActionType.ArchiveConversation]: (data: ArchiveConversationBlockSchema) => (
    <ArchiveConversationBlockViewer key={data.id} />
  ),
  [ActionType.UnArchiveConversation]: (
    data: UnArchiveConversationBlockSchema,
  ) => <UnArchiveConversationBlockViewer key={data.id} />,
  [ActionType.BlockContact]: (data: BlockContactBlockSchema) => (
    <BlockContactBlockViewer key={data.id} />
  ),

  // Email actions
  [ActionType.MarkEmailVerified]: (data: MarkEmailVerifiedBlockSchema) => (
    <MarkEmailVerifiedBlockViewer key={data.id} />
  ),
  [ActionType.OptInEmail]: (data: OptInEmailBlockSchema) => (
    <OptInEmailBlockViewer key={data.id} />
  ),
  [ActionType.OptOutEmail]: (data: OptOutEmailBlockSchema) => (
    <OptOutEmailBlockViewer key={data.id} />
  ),
}

export default function SendMessageNodeViewer({
  data,
  id,
}: {
  data: SendMessageNodeSchema
  id: string | number
}) {
  const [openToolbar, onOpenToolbar] = useState(false)

  return (
    <>
      <FlowFlowNodeToolbar visible={openToolbar} />
      <Card
        className="w-72 hover:border-blue-500"
        onMouseOver={() => onOpenToolbar(true)}
        onMouseOut={() => onOpenToolbar(false)}
      >
        <CardHeader className="p-4">
          <CardTitle className="flex gap-1 items-center">
            <MessageCircleMoreIcon size={20} />
            {data.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {data.blocks.map((blockItem) =>
            blockItem?.actionType
              ? maps[blockItem?.actionType](blockItem)
              : null,
          )}
        </CardContent>
      </Card>
    </>
  )
}
