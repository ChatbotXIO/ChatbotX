const systemActivityTypes = new Set([
  "custom_field_changed",
  "custom_field_cleared",
  "tag_added",
  "tag_removed",
  "flow_triggered",
  "sequence_subscribed",
  "sequence_unsubscribed",
  "conversation_status_changed",
])

type SystemActivityMessage = {
  messageType?: string | null
  contentAttributes?: unknown
}

// Inicia funcion (isSystemActivityLog)
/**
 * Automation timeline rows (tags, fields, sequences, flow start).
 * Call cards and reactions are also `messageType: "activity"` but they do not
 * carry `activityType`, so the inbox preview and the show/hide toggle leave
 * them alone.
 */
export const isSystemActivityLog = (
  message: SystemActivityMessage,
): boolean => {
  if (message.messageType !== "activity") {
    return false
  }
  const attributes = message.contentAttributes
  if (!attributes || typeof attributes !== "object") {
    return false
  }
  const activityType = (attributes as { activityType?: unknown }).activityType
  return (
    typeof activityType === "string" && systemActivityTypes.has(activityType)
  )
}
// Finaliza funcion (isSystemActivityLog)
