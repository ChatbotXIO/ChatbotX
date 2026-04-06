import { clickhouseEventWriter } from "./clickhouse-event-writer"

export interface EventRow {
  channel: string | null
  contact_id: string
  country: string | null
  event_id: string
  event_type: string
  inserted_at: number
  metadata: string | null
  occurred_at: number
  sender_type: string
  source: string | null
  source_id: string | null
  workspace_id: string
}

export interface BotMessageEventRow {
  ai_provider: string
  channel: string | null
  conversation_id: string
  event_id: string
  has_response: number
  inserted_at: number
  message_id: string
  metadata: string | null
  occurred_at: number
  response_type: string
  result: string
  route_type: string
  source: string | null
  workspace_id: string
}

export interface ConversationEventRow {
  channel: string
  conversation_id: string
  event_id: string
  event_type: string
  from_assignee: string
  inserted_at: number
  metadata: string
  occurred_at: number
  to_assignee: string
  workspace_id: string
}

export interface EventWriter {
  insert(table: string, rows: EventRow[]): Promise<void>
  insertOne(
    table: string,
    row: EventRow | BotMessageEventRow | ConversationEventRow,
  ): Promise<void>
}

export type EventWriterType = "clickhouse"

const writers: Map<EventWriterType, EventWriter> = new Map([
  ["clickhouse", clickhouseEventWriter],
])

export function getEventWriter(type: EventWriterType): EventWriter {
  const writer = writers.get(type)
  if (!writer) {
    throw new Error(`Event writer not found for type: ${type}`)
  }
  return writer
}

export function getDefaultEventWriter(): EventWriter {
  const writerType =
    (process.env.EVENT_WRITER_TYPE as EventWriterType) || "clickhouse"
  return getEventWriter(writerType)
}
