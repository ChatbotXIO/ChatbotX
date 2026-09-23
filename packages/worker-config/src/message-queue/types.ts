export interface MessagePayload {
  key: string
  value: string
}

export interface MessagingProducer {
  close(): Promise<void>
  send(messages: MessagePayload[]): Promise<void>
}

export interface MessagingConsumer {
  close(): Promise<void>
  consume(handler: (payload: string) => Promise<void>): Promise<void>
  isRunning(): boolean
}

export interface ProducerConfig {
  topic: string
}

export interface ConsumerConfig {
  concurrency?: number
  removeOnComplete?: number
  removeOnFail?: number
  topic: string
}
