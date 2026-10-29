# Contacts and pipelines

Resolve a contact through a filtered list or a stable identifier. Contact tools accept `id:`, `email:`, or `phone:` identifiers; use an observed identifier rather than guessing from a display name.

Inspect existing tags, fields, sequences, and pipeline items before a requested update. Additive operations preserve existing data; replacement, block, import, bulk, and delete operations require careful review of the affected set.

For pipeline work, resolve the pipeline, stage, item, and assignees from API results. Confirm a move, assignment, close, or bulk change only after the target stage and affected items are visible in the proposed action.

Do not create duplicate contacts, sequence subscriptions, tags, or pipeline items after a timeout or ambiguous response. Read the resource state first, then explain what is known.
