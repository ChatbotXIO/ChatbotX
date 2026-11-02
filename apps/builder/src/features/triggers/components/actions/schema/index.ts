import { addTags } from "./add-tags"
import { clearCustomField } from "./clear-custom-field"
import { pipeline } from "./pipeline"
import { removeTags } from "./remove-tags"
import { runGoogleSheet } from "./run-google-sheet"
import { sendGoogleAdsConversion } from "./send-google-ads-conversion"
import { sendMetaCapiEvent } from "./send-meta-capi-event"
import { setCustomField } from "./set-custom-field"
import { startExternalStep } from "./start-external-step"
import { startFlow } from "./start-flow"
import { transferConversationToHuman } from "./transfer-conversation-to-human"

export const allActions = {
  addTags,
  removeTags,
  setCustomField,
  clearCustomField,
  startFlow,
  startExternalStep,
  transferConversationToHuman,
  sendMetaCapiEvent,
  sendGoogleAdsConversion,
  runGoogleSheet,
  pipeline,
}
