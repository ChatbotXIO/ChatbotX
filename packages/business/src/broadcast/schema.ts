import type {
  BroadcastSubaction,
  ChannelType,
} from "@chatbotx.io/database/partials"
import type { ContactFilterCriteriaInput } from "@chatbotx.io/database/queries"

export type BroadcastAudienceInput = {
  workspaceId: string
  channels?: ChannelType[] | null
  integrationWhatsappId?: string | null
  integrationMessengerId?: string | null
  contactFilter?: ContactFilterCriteriaInput | null
  canViewEmailAndPhone?: boolean
  subaction?: BroadcastSubaction | null
  restrictToAssignedUserId?: string
}

export type BroadcastAudiencePreviewRow = {
  contactId: string
  contactInboxId: string
  firstName: string | null
  lastName: string | null
  fullName: string | null
  avatar: string | null
  createdAt: Date
  channel: ChannelType
  conversationId: string | null
}

type BroadcastBaseTemplateDetail = {
  id: string
  name: string
  language: string
  category: string
  status: string
  components: unknown
  integrationName: string | null
}

export type BroadcastTemplateDetail =
  | (BroadcastBaseTemplateDetail & {
      channel: "whatsapp"
    })
  | (BroadcastBaseTemplateDetail & {
      channel: "messenger"
      parameterFormat: string
    })
