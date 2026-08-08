import type { PullCoexistChannel } from "@chatbotx.io/database/repositories"
import type { IncomingContact } from "@chatbotx.io/sdk"
import type { HistoricalMessage } from "./bulk-historical-import"

export type AppUsageSignal = {
  kind: "meta-app-usage"
  callCount?: number
  totalCputime?: number
  totalTime?: number
}

export type BusinessUseCaseUsageSignal = {
  kind: "meta-business-use-case-usage"
  estimatedTimeToRegainAccess?: number
  callCount?: number
  totalCputime?: number
  totalTime?: number
}

export type CoexistUsageSignal = AppUsageSignal | BusinessUseCaseUsageSignal

export type PullConversationPage<Conversation> = {
  conversations: Conversation[]
  after?: string
  usageSignal?: CoexistUsageSignal | null
}

export type PullMessagePage<MessageDetail> = {
  messages: MessageDetail[]
  after?: string
  usageSignal?: CoexistUsageSignal | null
}

export type ContactEnrichment = {
  phoneNumber?: string
  email?: string
}

export type PullCoexistAdapter<Context, Conversation, MessageDetail> = {
  channel: PullCoexistChannel
  loadContext(input: {
    workspaceId: string
    integrationId: string
  }): Promise<Context | null>
  listConversations(input: {
    context: Context
    cursor?: string
  }): Promise<PullConversationPage<Conversation>>
  fetchConversationMessages(input: {
    context: Context
    conversationId: string
    cursor?: string
  }): Promise<PullMessagePage<MessageDetail>>
  resolveContact(input: {
    context: Context
    conversation: Conversation
    messages: MessageDetail[]
  }): IncomingContact | null
  // Optional: resolve a participant's real display name from the user node.
  // Instagram's conversation participants carry only `{id, username}`, so the
  // name is read separately here and split into first/last name downstream.
  // Providers whose participants already include `name` (e.g. Messenger) omit
  // this. Returns null when the profile cannot be resolved (keeps the fallback).
  // `usageSignal` surfaces the call's Graph usage so the engine can feed it to
  // the shared throttle, just like conversation/message pulls.
  resolveContactProfile?(input: {
    context: Context
    sourceId: string
  }): Promise<{
    name: string | null
    usageSignal?: CoexistUsageSignal | null
  } | null>
  toHistoricalMessage(input: {
    context: Context
    message: MessageDetail
    cutoff: Date
    totalMessagesSeen: number
  }): HistoricalMessage | null
  discoverContactEnrichment(input: {
    context: Context
    messages: HistoricalMessage[]
  }): ContactEnrichment
  getConversationUpdatedAt(input: {
    conversation: Conversation
  }): Date | undefined
}
