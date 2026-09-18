/**
 * `triggerHandler` values passed to `conversationService.claimForCallAgent`.
 * `triggerHandler` is a free-form string with no shared enum, so these live
 * with the WhatsApp calling code rather than being hand-typed per call site.
 */
export const CALL_ASSIGNMENT_TRIGGER_HANDLERS = {
  answered: "whatsappCallAnswered",
  dialed: "whatsappCallDialed",
} as const satisfies Record<string, string>
