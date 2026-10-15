import z from "zod"
import { contactInfoUpdated } from "./contact-info-updated"
import { customFieldValueChanged } from "./custom-field-value-changed"
import { dateTimeBasedTrigger } from "./date-time-based-trigger"
import {
  archived,
  callEnded,
  callRecorded,
  callTranscribed,
  contactReferredANewContact,
  contactReferredExistingContact,
  contactUnsubscribedFormBroadcast,
  conversationAssigned,
  conversationTransferredToBot,
  conversationTransferredToHuman,
  conversationUnassigned,
  followUp,
  incomingCall,
  missedAudioCall,
  newContact,
  shoppingCartSent,
  subscribedToSequence,
  unsubscribedFromSequence,
  userAskedAboutProduct,
} from "./simple-conditions"
import { tagApplied } from "./tag-applied"
import { tagRemoved } from "./tag-removed"

export const allConditions = {
  tagApplied,
  tagRemoved,
  customFieldValueChanged,
  contactInfoUpdated,
  dateTimeBasedTrigger,
  conversationTransferredToHuman,
  conversationTransferredToBot,
  newContact,
  contactUnsubscribedFormBroadcast,
  archived,
  followUp,
  conversationAssigned,
  conversationUnassigned,
  subscribedToSequence,
  unsubscribedFromSequence,
  contactReferredANewContact,
  contactReferredExistingContact,
  incomingCall,
  missedAudioCall,
  callEnded,
  callRecorded,
  callTranscribed,
  shoppingCartSent,
  userAskedAboutProduct,
}

export const conditionSchema = z.union(Object.values(allConditions))
export type ConditionInput = z.infer<typeof conditionSchema>
