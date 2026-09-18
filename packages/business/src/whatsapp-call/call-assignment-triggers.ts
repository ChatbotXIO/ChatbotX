/**
 * `triggerHandler` values passed to `conversationService.claimForCallAgent`
 * (P3 auto-assign, plan §5 P3). Kept here rather than in the channel-agnostic
 * `conversation` service — `triggerHandler` is a free-form string across the
 * codebase (no shared enum to extend), but the two call sites that trigger an
 * auto-claim are WhatsApp-specific, so the two literal values live with the
 * WhatsApp calling code instead of being hand-typed at each call site.
 */
export const CALL_ASSIGNMENT_TRIGGER_HANDLERS = {
  answered: "whatsappCallAnswered",
  dialed: "whatsappCallDialed",
} as const satisfies Record<string, string>
