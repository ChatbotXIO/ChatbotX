## Multi-Account Pickers

Channels whose provider returns a list of connectable accounts — Messenger
pages, Instagram-via-Facebook accounts, WhatsApp phone numbers — share one
implementation instead of each building its own picker:
`apps/builder/src/features/channel-connect/` (`ConnectSelectionForm` +
`useConnectFlow` + `ConnectManyDialog` + `CoexistStep`).

- **Resolve the session through the shared sequence** — provider connection
  cores call `runConnectSequence` from
  `channel-connect/lib/run-connect-sequence.ts`. It centrally calls
  `resolveConnectSession` to validate pending auth, workspace membership,
  tenant-aware credential ownership, and workspace access before the
  channel-specific candidate lookup or persistence.
- **Single-account server core + typed oRPC procedure** — one plain server
  function per provider id (e.g. `actions/connect-page.ts`'s
  `connectMessengerPage`), returning `ConnectActionResult<TOutcome>`
  (`{ kind: "outcome", outcome }` or `{ kind: "sessionError", code }`) —
  never a thrown exception the client has to classify, and never a 500 (the
  procedure would be unclassifiable). Build the three outcome literals with
  `lib/connect-action-outcomes.ts`'s `notSelectableOutcome` /
  `duplicatedOutcome` / `connectedOutcome`, wrap best-effort follow-ups
  (branding, tag scan, …) in `runConnectFollowUps`, and convert the core's
  outer catch with `toConnectActionFailure`. Expose it through the
  integration's `api/` procedure and register it through the feature's
  `api/index.ts` — **not** a server action: Next serializes server actions
  from one browser, so the picker's batch could only connect one account at a
  time. Add a server action only for a form that genuinely needs one (as
  WhatsApp's top-level connect form does), delegating to the same core.
- **Client side** — every picker calls its typed oRPC procedure through
  `lib/connect-client.ts`'s `connectViaApi` and
  `CONNECT_CHANNEL_REGISTRY[channel].connectRoute`, which turns any transport
  failure into the batch's own `failed`/`unknown` outcome. `useConnectFlow`
  runs a single pick inline (button spinner) and fans 2+ picks out through
  `ConnectManyDialog`'s status list, `CONNECT_CONCURRENCY` at a time.
  On a coexist-eligible channel (`isCoexistChannel`,
  `packages/utils/src/channel.ts`) the "sync existing history" opt-in is a
  **per-row switch in the picker** (`CoexistRowSwitch` /
  `CoexistOptionsPanel`), not a step: each row's call runs right after that
  row connects, via `lib/coexist-client.ts`'s `setCoexist`
  (`useConnectBatch`'s `afterConnect` for a batch, inline in `useConnectFlow`
  for a single pick). A channel with its own picker form gets the same rule
  by calling `hooks/use-coexist-selection.tsx`'s `useCoexistSelection` —
  don't re-derive `coexistIds ⊆ selectedIds` by hand. The dialog's Continue
  skips every channel extra step on the session errors in
  `SESSION_ERRORS_SKIPPING_EXTRA_STEPS` (`lib/row-status.ts`), whose routes
  `workspaceAuthorizedMidddleware` would deny anyway.
  `CoexistStep`/`CoexistPopup` survive only for WhatsApp's
  manual/auto-select direct path.
- **New channel registration** — add one entry to
  `lib/registry.ts`'s `CONNECT_CHANNEL_REGISTRY`, typed
  `satisfies Record<ConnectPickerChannel, ConnectChannelConfig>` so a missing
  channel fails to compile. That file is the only place in
  `channel-connect` allowed to hard-code a channel name.
- **Row/warning copy** — `lib/row-status.ts` (`ROW_STATUS`,
  `REASON_MESSAGE_KEYS`, `WARNING_MESSAGE_KEYS`,
  `SESSION_ERROR_MESSAGE_KEYS`) is the single source of i18n keys for every
  row state, failure reason, and outcome warning shown in the dialog — reuse
  these, don't add a channel-local copy of the same labels.
