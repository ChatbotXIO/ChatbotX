import { addTags } from "./add-tags"
import { clearCustomField } from "./clear-custom-field"
import { removeTags } from "./remove-tags"
import { runGoogleSheet } from "./run-google-sheet"
import { setCustomField } from "./set-custom-field"
import { startFlow } from "./start-flow"
import { transferConversationToHuman } from "./transfer-conversation-to-human"

export const allActions = {
  addTags,
  removeTags,
  setCustomField,
  clearCustomField,
  startFlow,
  transferConversationToHuman,
  runGoogleSheet,
}
