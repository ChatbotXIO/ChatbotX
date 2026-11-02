---
name: integration-channel
description: >-
  Create and modify integration channels (messenger, whatsapp, zalo, tiktok, threads,
  webchat, etc.) for the chatbot platform. Use when adding a new channel integration,
  modifying webhook handlers, working with message send/receive or comment handlers,
  adding a multi-account connect picker, registering a channel in builder/worker, or
  connecting external platforms.
---

# Integration Channel Development

## Architecture Overview

Integrations are standalone packages under `integrations/` that implement the `IntegrationDefinition` contract from `@chatbotx.io/sdk`.

**Flow:** External platform → webhook → builder route → BullMQ queue → worker → integration handler

## Pre-Creation Confirmation (MANDATORY)

Before writing any code, you **MUST** resolve the 3 questions below. Analyze the user's request first, ask only what's missing, then present a confirmation summary and wait.

### Question 1: Integration name

Channel name → determines package name (`@chatbotx.io/integration-<channel>`), DB table (`Integration<Channel>`), all file paths.

### Question 2: Auth fields

| Base                          | When to use                                               | Examples                          |
| ----------------------------- | --------------------------------------------------------- | --------------------------------- |
| `customAuthSchema` (from SDK) | User provides credentials directly. No OAuth.             | smtp, webchat, telegram           |
| `Oauth2AuthValue` (from SDK)  | Platform uses OAuth2 with clientId/clientSecret + tokens. | messenger, whatsapp, zalo, tiktok, threads |

For EACH field: name, Zod type, required or optional. Infer types from context (e.g. "port" → `z.number().int().positive()`).

### Question 3: Platform credentials

| Scenario                                                   | Platform credentials? | Examples                          |
| ---------------------------------------------------------- | --------------------- | --------------------------------- |
| OAuth app (clientId/clientSecret shared across workspaces) | YES                   | messenger, whatsapp, zalo, tiktok, threads |
| Per-workspace credentials only                             | NO                    | smtp, webchat, telegram           |
| Shared third-party API key                                 | YES                   | giphy, stripe                     |

### Confirmation Summary

```
Integration: <channel>
Auth type: custom / oauth2
Auth fields:
  - fieldA: z.string().min(1)        [required]
  - fieldB: z.number().int()          [required]
Platform credentials: YES / NO
```

Wait for user confirmation before proceeding.

---

## Creating a New Integration — Execution Plan

After confirmation, execute these 4 phases **in order**. Each phase ends with a verification step. Read the phase file before starting it.

| Phase | Do | Read |
|---|---|---|
| 1. Package | `cp -r integrations/telegram integrations/<channel>`, rename, strip Telegram logic | [phase-1-package.md](references/phase-1-package.md) |
| 2. Database | Create schema + relations files, edit 5 registration files | [phase-2-database.md](references/phase-2-database.md) |
| 3. Registration | Edit 4 integration files + 3 UI files | [phase-3-registration.md](references/phase-3-registration.md) |
| 4. Builder feature | Feature directory + settings page | [phase-4-builder-feature.md](references/phase-4-builder-feature.md) |

### Traps that fail silently

- **`relations/index.ts` needs TWO edits** — the import AND the spread in the `relations` object. Read each file back after editing.
- **Import and usage are separate edits** in `apps/builder/src/integration.ts` and `apps/worker/src/services/integrations.ts` — read back lines 1-10 to confirm the import exists.
- **`ChannelType` cascade** — adding a value to `channelTypes` (defined in `packages/utils/src/channel.ts`) breaks every `Record<ChannelType, ...>`; grep `Record<ChannelType` and multiline `Record<\n\s*ChannelType` and fix ALL hits. A `CHANNEL_CAPABILITIES` entry marked `manageable` needs the Phase 4 settings page, or the row 404s.
- **Webhook URLs on white-label** — register provider webhook URLs on the broker host (`getBrokerOrigin()` / `buildBrokerCallbackUrl()`), not the tenant's custom domain; see [webhook-flow.md](references/webhook-flow.md).
- **Phase 3 checkpoint:** run `pnpm lint` and `pnpm --filter <touched-workspace> check-types`; fix undeclared-variable / missing-import errors before continuing.
- **Logging:** use the structured logger, never `console`, and log with `{ err: error }` (AGENTS.md invariant 20).

## Post-Creation Verification

Run these checks **in order**:

1. **`CI=true pnpm install --no-frozen-lockfile`** — link the new workspace package (`CI=true` avoids the TTY prompt)
2. **`pnpm fix`** then **`pnpm lint`** — auto-fix formatting, then confirm clean (ignore pre-existing errors in untouched files)
3. **`pnpm turbo build`** — if it fails, read errors, fix, re-run

### Common Build Errors

| Error                                                                  | Cause                                                   | Fix                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| `Cannot find module '@chatbotx.io/integration-<channel>'`              | Package not linked                                      | Run `pnpm install --no-frozen-lockfile`                        |
| `Property '<channel>' is missing in type ... Record<ChannelType, ...>` | Enum value added but not all Records updated            | Grep `Record<ChannelType` and add missing entry                |
| `The ... variable is undeclared`                                       | Import missing                                          | Read back file to verify import line exists, re-add if missing |
| `Target signature provides too few arguments`                          | Action uses `bindArgsSchemas` but form didn't `.bind()` | Use `action.bind(null, workspaceId)` in useHookFormAction      |
| `Type 'string' is not assignable to type ChannelType`                  | Passing untyped string to InboxIcon                     | Cast with `as ChannelType` and add import                      |
| `Argument of type '{}' ... parameter of type 'void'`                   | Calling `execute({})` on no-input action                | Use `execute()` with no arguments                              |

## References

| File | Read when |
|---|---|
| [references/phase-1-package.md](references/phase-1-package.md) | Creating the `integrations/<channel>/` package (files to change) |
| [references/phase-2-database.md](references/phase-2-database.md) | Adding the Drizzle schema, relations, and the 5 registration edits |
| [references/phase-3-registration.md](references/phase-3-registration.md) | Registering in builder/worker/UI and `CHANNEL_CAPABILITIES` |
| [references/phase-4-builder-feature.md](references/phase-4-builder-feature.md) | Building the feature directory and settings page |
| [references/platform-credentials.md](references/platform-credentials.md) | Channel needs shared OAuth app / API-key platform credentials |
| [references/webhook-flow.md](references/webhook-flow.md) | Writing a webhook handler or registering webhook URLs (incl. white-label broker host) |
| [references/comment-handler-pattern.md](references/comment-handler-pattern.md) | Adding or changing a `comment` channel (handlers layout). For auto-reply/like/hide behaviour see the `comment-automation` skill |
| [references/multi-account-pickers.md](references/multi-account-pickers.md) | Channel returns a list of connectable accounts (pages, phone numbers) |
| [references/existing-integrations.md](references/existing-integrations.md) | Checking auth type / credentials of existing integrations, channel vs integration |
