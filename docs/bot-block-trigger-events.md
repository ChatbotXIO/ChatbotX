# Bot block trigger events

Two trigger/webhook events tell a workspace when a contact blocks or unblocks
its bot. Today only Telegram reports them.

| Event type | Webhook `event` | Fires when |
|---|---|---|
| `contactBlockedBot` | `contact_blocked_bot` | The user blocks the bot in their private chat. |
| `contactUnblockedBot` | `contact_unblocked_bot` | The user unblocks the bot, or presses /start again after blocking it. |

Both are simple conditions (no `sourceId`, operator or value). The builder lists
them under **Telegram** in the Triggers and Webhooks condition menus, and the
public API (`triggers.update`, webhook update) accepts them like any other
condition. Templates copy them as they are, since they name no resource.

The webhook payload is the base payload plus `channel`:

```json
{ "event": "contact_blocked_bot", "contact_id": "123", "timestamp": "…", "channel": "telegram" }
```

## Where the signal comes from

Telegram sends a `my_chat_member` update for the private chat when the user
blocks or unblocks the bot: the bot's status goes to `kicked` on a block and
from `kicked` back to `member` on an unblock.

1. [`integrations/telegram/src/handlers/webhook.ts`](../integrations/telegram/src/handlers/webhook.ts)
   turns the update into a `botChatStatus` audience job carrying the new status,
   the old status and the user. Like every audience event, it is only queued
   when the request carries the bot's webhook secret token: an unverified update
   could be forged to fire someone's triggers.
2. [`apps/worker/src/integration/handlers/channel-audience-event.ts`](../apps/worker/src/integration/handlers/channel-audience-event.ts)
   sends private chats to
   [`telegram-bot-block.ts`](../apps/worker/src/integration/handlers/telegram-bot-block.ts);
   groups and channels still go to the leaderboard group picker
   (`TelegramChat` table). Private chats are no longer written there.
3. `telegram-bot-block.ts`:
   - works out the transition (`resolveBotBlockTransition`); anything that is
     neither a block nor an unblock fires nothing;
   - looks up the **existing** contact by the user's Telegram id and never
     creates one, so a stranger blocking the bot costs no MAC quota;
   - claims the event once in Redis (`SET NX`, 24 hours, keyed by inbox, user,
     event time and transition) so a Telegram retry of the same update does not
     fire twice;
   - emits `emitContactBlockedBot` / `emitContactUnblockedBot` inside a
     channel-originated webhook context, because outbound webhooks only deliver
     channel-originated events and an audience job is not one by default.

## Limits

- **Blocks that happened before this shipped never fire.** Telegram does not
  resend old updates, and there is no API to ask which users have blocked a bot.
- **Older bots need their webhook registered again.** Bots connected before
  `my_chat_member` joined `TELEGRAM_ALLOWED_UPDATES` (2026-10-16) never receive
  the update, and bots connected before webhook secret tokens existed have their
  audience updates dropped. Reconnecting the bot fixes one bot; for all of them
  run, once per deployment:

  ```bash
  pnpm --filter worker backfill:telegram-webhooks
  ```

  [`apps/worker/scripts/reregister-telegram-webhooks.ts`](../apps/worker/scripts/reregister-telegram-webhooks.ts)
  registers every connected bot again with the current `allowed_updates` and a
  secret token. A bot without a secret gets a new one; the webhook is registered
  first and the secret saved after, so updates in between are still accepted. A
  bot with a secret keeps it. Revoked tokens are skipped. It is safe to re-run,
  and exits with code 1 when any bot failed so a re-run can pick it up. It needs
  `NEXT_PUBLIC_BROKER_URL` or `NEXT_PUBLIC_BUILDER_URL` to build the same webhook
  URL the builder registers on connect.
- No contact state is stored: there is no "blocked the bot" contact filter, and
  broadcasts do not skip these contacts on their own. Use the trigger to tag
  them if you need that.
