import {
  type TriggerAction,
  triggerActions,
} from "@chatbotx.io/database/partials"
import {
  archiveConversation,
  assignConversation,
  disableBot,
  enableBot,
  transferConversationToHuman,
  unarchiveConversation,
  unassignConversation,
} from "./conversation-actions"
import { clearCustomField, setCustomField } from "./custom-field-actions"
import { startAnotherFlow, startExternalStep } from "./flow-actions"
import {
  runGoogleSheet,
  sendGoogleAdsConversion,
  sendMetaCapiEvent,
} from "./integration-actions"
import { pipeline } from "./pipeline-action"
import { addTag, removeTag } from "./tag-actions"
import type { TriggerActionHandler } from "./types"

/**
 * Replay contract: once actions have run, a failure while recording the run
 * (contact history, stats) is logged and NOT retried, so BullMQ never re-runs
 * them. A worker crash between an action and that bookkeeping is accepted: the
 * job is retried and the actions run again. Not idempotent on replay:
 * `addTag` (re-enqueues sync), `startAnotherFlow` and `startExternalStep` from a trigger (no job id),
 * `archiveConversation` / `unarchiveConversation` (reset timestamps),
 * `assignConversation`, and `runGoogleSheet` sends. `sendMetaCapiEvent`
 * (source key) and `sendGoogleAdsConversion` (`occurrenceKey`) are deduped.
 *
 * One handler per stored trigger action. `satisfies` makes a new
 * `triggerActions` value a compile error until it has a handler.
 */
export const TRIGGER_ACTION_HANDLERS = {
  addTag,
  removeTag,
  setCustomField,
  clearCustomField,
  startAnotherFlow,
  startExternalStep,
  archiveConversation,
  unarchiveConversation,
  assignConversation,
  unassignConversation,
  disableBot,
  enableBot,
  transferConversationToHuman,
  sendMetaCapiEvent,
  sendGoogleAdsConversion,
  runGoogleSheet,
  pipeline,
} satisfies Record<TriggerAction, TriggerActionHandler>

export const resolveTriggerActionHandler = (
  actionType: unknown,
): TriggerActionHandler | null => {
  const parsed = triggerActions.safeParse(actionType)
  return parsed.success ? TRIGGER_ACTION_HANDLERS[parsed.data] : null
}
