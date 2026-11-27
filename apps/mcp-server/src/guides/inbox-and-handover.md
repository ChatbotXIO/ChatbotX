# Inbox and handover

Resolve the conversation and its selected inbox before changing thread control, assignment, bot state, or replying. A conversation reply uses `messages.create` with the conversation ID; do not substitute a contact-level send.

Preserve the observed channel and inbox. Do not enable or disable a bot, assign a thread, or transfer control based on a name match alone. Ask for a disambiguator when multiple conversations, teams, or inboxes match.

Sending a message is outbound. Review recipients, channel, content, and attachments with the user before approval. Report the API result precisely: created, queued, accepted, or delivered are distinct states.

If a handover or connection operation returns `nextAction`, `awaiting_selection`, or a URL, stop and present that checkpoint to the user. Continue only after the user completes it and the relevant read operation confirms the new state.

Inbox translation: the customer's language comes from `translation.getConversationState`. Customer text is translated only when `translation.requestMessages` asks for it, and the result appears in `messages.list` under `translation`. To reply in the customer's language, preview with `translation.previewText`, then send with `translate: true` (or `editedTranslation`). The send waits up to 10 seconds. If the translation fails, nothing is sent and the call fails with `translationNotSent`: `data.reason` says why, and `data.conversationTranslation: "off"` means the AI provider failed and translation was turned off for the conversation, so a new send goes out as written. Tell the user the message was not sent, and do not resend it untranslated without their approval. Turning translation on sends customer chat text to the chosen AI provider; get the user's approval first.
