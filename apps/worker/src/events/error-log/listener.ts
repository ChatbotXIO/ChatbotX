import type {
  BaseEventListener,
  ErrorLogEventMap,
  ErrorLogRecordedPayload,
} from "@chatbotx.io/event-bus"
import { errorLogEventTypeSchema } from "@chatbotx.io/event-bus"
import { writeErrorLogs } from "./handlers/write-error-log"

export const errorLogListeners: Partial<
  Record<keyof ErrorLogEventMap, BaseEventListener<ErrorLogRecordedPayload>[]>
> = {
  [errorLogEventTypeSchema.enum["error-log:recorded"]]: [
    {
      name: "error-log-writer",
      handler: writeErrorLogs,
    },
  ],
}
