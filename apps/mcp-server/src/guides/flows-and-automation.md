# Flows and automation

Before authoring a channel-bound flow, call `capabilities.get` with the target channel and `schemas.flowSpec` for the FlowSpec JSON schema. Resolve every referenced entity from a list or get operation; do not invent IDs.

A trigger's `startExternalStep` action needs a `flowId` and a `nodeId` from `flows.listNodes` (a published node); its `pipeline` action takes the Pipelines flow-step fields. Its `addSequence` and `removeSequence` actions take `sequenceIds` (from `sequences.list`, at most 50); subscribing or unsubscribing from a trigger does not fire sequence triggers or sequence outbound webhooks, and one trigger runs at most about 20 times per contact per minute, in a fixed window (further runs are skipped). A trigger update rejects a new action that points at a missing record, naming `actions.<index>.<field>`.

Use `flows.validate` for a FlowSpec before a requested publish. Validation does not save or publish. A draft-only request may use `flows.updateDraft` but must never publish or send. Publishing is a separate confirmed action.

For broadcasts, resolve content, channel or inbox, audience, timezone, and intended send instant first. Preview recurring schedules with `broadcasts.previewRecurrence`; schedule only after the user approves the observed result. Do not select an alternative time after an unavailable or rejected schedule.

For bulk automation changes, prefer a server-side dry-run and explicit confirmation contract. `aiHandover.setApplyToAll` returns `dryRun`, `eligibleCount`, and `confirmCount`; use the returned confirmation data rather than estimating affected records client-side.
