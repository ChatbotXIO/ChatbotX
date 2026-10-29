# Inbox and handover

Resolve the conversation and its selected inbox before changing thread control, assignment, bot state, or replying. A conversation reply uses `messages.create` with the conversation ID; do not substitute a contact-level send.

Preserve the observed channel and inbox. Do not enable or disable a bot, assign a thread, or transfer control based on a name match alone. Ask for a disambiguator when multiple conversations, teams, or inboxes match.

Sending a message is outbound. Review recipients, channel, content, and attachments with the user before approval. Report the API result precisely: created, queued, accepted, or delivered are distinct states.

If a handover or connection operation returns `nextAction`, `awaiting_selection`, or a URL, stop and present that checkpoint to the user. Continue only after the user completes it and the relevant read operation confirms the new state.
