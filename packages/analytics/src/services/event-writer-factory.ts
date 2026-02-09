import { clickhouseEventWriter } from "./clickhouse-event-writer"

export interface EventRow {
  event_id: string
  chatbot_id: string
  contact_id: string
  event_type: string
  occurred_at: number
  source: string | null
  source_id: string | null
  channel: string | null
  country: string | null
  metadata: string | null
  inserted_at: number
}

export interface BotMessageEventRow {
  event_id: string
  chatbot_id: string
  message_id: string
  conversation_id: string
  occurred_at: number
  has_response: number
  response_type: string
  result: string
  ai_provider: string
  channel: string | null
  source: string | null
  metadata: string | null
  inserted_at: number
}

export interface ConversationEventRow {
  event_id: string
  chatbot_id: string
  conversation_id: string
  event_type: string
  occurred_at: number
  from_assignee: string
  to_assignee: string
  channel: string
  metadata: string
  inserted_at: number
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
