export interface WorkerManifestEntry {
  /** Relative path from apps/worker/, used by tsdown and the dev runner. */
  entry: string
  /** Stable id used for the dev runner prefix and log labels. */
  id: string
  /** Discriminates BullMQ workers from Kafka / sequence-scheduler entries. */
  kind: "bullmq" | "kafka" | "sequence-scheduler"
}

export const workers = [
  { id: "chat", entry: "src/chat/worker.ts", kind: "bullmq" },
  { id: "integration", entry: "src/integration/worker.ts", kind: "bullmq" },
  { id: "ai-agent", entry: "src/ai-agent/worker.ts", kind: "bullmq" },
  { id: "default", entry: "src/default/worker.ts", kind: "bullmq" },
  { id: "trigger", entry: "src/trigger/worker.ts", kind: "bullmq" },
  { id: "webhook", entry: "src/webhook/worker.ts", kind: "bullmq" },
  { id: "analytics", entry: "src/analytics/worker.ts", kind: "bullmq" },
  { id: "schedule", entry: "src/schedule/worker.ts", kind: "bullmq" },
  { id: "events", entry: "src/events/worker.ts", kind: "kafka" },
  {
    id: "sequence-scheduler",
    entry: "src/sequence-scheduler/worker.ts",
    kind: "sequence-scheduler",
  },
  {
    id: "sequence-producer",
    entry: "src/sequence-scheduler/worker-producer.ts",
    kind: "sequence-scheduler",
  },
  {
    id: "sequence-consumer",
    entry: "src/sequence-scheduler/worker-consumer.ts",
    kind: "sequence-scheduler",
  },
] as const satisfies readonly WorkerManifestEntry[]
