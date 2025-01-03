import { Contact } from "@ahachat.ai/database"

export type Conversation = {
  id: string
  contactId: string
  channelType: string
  lastActivityAt: string
  contactLastSeenAt: Date
  lastMessageAt: Date
  lastMessage: string
  assignedType: string | null
  assignedId: string | null
  contact: Contact
  assignedTeam?: Assigned
  assignedUser?: Assigned
  isActive: boolean
}

export interface Assigned {
  id: string
  image?: string
  firstName?: string
}
