### Phase 3: Registration (edit 7 files)

**Integration registration (4 files, single batch):**

| #   | File                                       | Edit                                                                                                                                           |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/builder/src/integration.ts`          | Add `import { integration as integration<Channel> } from "@chatbotx.io/integration-<channel>"` AND `<channel>: integration<Channel>` in object |
| 2   | `apps/worker/src/services/integrations.ts` | Add `import ...` AND `<channel>: integration<Channel>` in `allIntegrations`                                                                    |
| 3   | `apps/builder/package.json`                | Add `"@chatbotx.io/integration-<channel>": "workspace:*"` to dependencies                                                                      |
| 4   | `apps/worker/package.json`                 | Add `"@chatbotx.io/integration-<channel>": "workspace:*"` to dependencies                                                                      |

**CRITICAL — verify imports:** After each edit to `integration.ts` and `integrations.ts`, immediately read back lines 1-10 to confirm the import line is actually present. The `import` and the usage are TWO separate edits.

**UI registration (2 files):**

| #   | File                                                               | Edit                                                                                                             |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 5   | `apps/builder/src/features/inboxes/components/inbox-icon.tsx`      | Add icon to lucide import AND entry in `INBOX_ICON_CONFIG`                                                       |
| 7   | `packages/utils/src/channel.ts`                                    | Add `CHANNEL_CAPABILITIES` entry (`creatable`, `manageable`, `requiresCredential`, `order`) — `CREATABLE_CHANNELS`/`MANAGEABLE_CHANNELS` derive from it, so the create picker and the settings accordion row appear automatically |

**CRITICAL — `ChannelType` cascade:** Adding a value to the `channelTypes` enum causes compile errors in every `Record<ChannelType, ...>` that doesn't include the new key. Grep for `Record<ChannelType` and `Record<\n\s*ChannelType` (multiline) to find and fix ALL hits.

**Phase 3 checkpoint:** Run `pnpm lint` and `pnpm --filter <touched-workspace> check-types` on the modified files. Fix any undeclared-variable or missing-import errors before continuing.
