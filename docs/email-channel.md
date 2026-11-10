# Email channel (SMTP inbox)

An SMTP inbox is a two-way email channel. Agents and flows **send** from it, and incoming mail **opens and continues conversations** by IMAP polling or an inbound-parse webhook. Public API: `smtpIntegrations.*` (CLI: `chatbotx smtp-integrations …`).

## Identity and threading

- One contact per sender address: `ContactInbox.sourceId` is the lowercase sender email. There is one conversation per contact, as on other channels.
- `Message.sourceId` is the RFC `Message-ID`. Thread headers are kept in `contentAttributes.email` (`subject`, `messageId`, `inReplyTo`, `references`, `from`, `to`, `cc`, `html`).
- **Sending** (`integrations/smtp/src/handlers/message/send-message.ts`): `From` is the inbox's `fromAddress`; the subject is `Re: <last inbound subject>`; `In-Reply-To` and `References` come from the last inbound mail. The worker (`withEmailThread` in `apps/worker/src/chat/handlers/send-message.ts`) attaches those headers because the handler only sees the outgoing message. An explicit `contentAttributes.email` wins. The generated `Message-ID` is returned so the customer's next reply links back.
- Flows can send `sendText` steps (website buttons become links); other step types are unsupported on this channel (`packages/flow-config/src/channel-rules/policies/smtp.ts`). The separate flow `email` step is unchanged and saves no message.
- The inbox shows `contentAttributes.email.subject` above the message text. HTML is stored for reference and **never rendered**; the body is text only, with quoted history stripped (`inbound/quoted-reply.ts`).

## Receiving mail

Two modes, picked by provider (`imapHostMap` / `inboundWebhookProviders` in `integrations/smtp/src/schema.ts`):

| Provider | Receive by |
|----------|------------|
| Gmail, Outlook, Yahoo, Zoho, Other | IMAP polling (opt-in per inbox: `imap.enabled`) |
| SendGrid, Mailgun, Postmark, Brevo | Inbound webhook |
| Amazon SES | Not supported (SES uses SNS); send only |

Both modes enqueue an `incomingMessage` job whose payload is `{ raw: <base64 RFC 5322 source> }` (5 MB cap). `receiveMessage` parses it, so every source behaves the same.

### What is dropped

Auto-replies and loops: `Auto-Submitted`, `Precedence: bulk|junk|auto_reply|list`, `X-Auto-Response-Suppress`, `List-Id`, bounce senders (`mailer-daemon`, `postmaster`), and mail from the inbox's own address. A failed attachment upload does not lose the message.

### IMAP polling

- `pollSmtpInboxes` (schedule, every minute) enqueues one `pollSmtpInbox` job per due inbox. It picks the least-recently-polled first, so above the per-run limit every inbox still gets a turn.
- `pollSmtpInbox` holds a per-inbox lock (`smtp:imap:<id>`), reads up to 50 mails **without changing flags**, enqueues each, and only then advances the cursor (`imapUidValidity` + `imapLastUid`). Job ids are deterministic and colon-free (`smtp-in-<inbox>-<uidValidity>-<uid>`), so a crash between enqueue and cursor write re-enqueues harmlessly.
- The first poll, a changed `UIDVALIDITY`, or a changed mailbox/host/login **re-baselines at "now"**: no history is imported.
- A failed poll stores `lastPollError` and pauses that inbox for 10 minutes (`imapNextPollAt`).
- IMAP reuses the SMTP username and password unless `imap.username` / `imap.password` are set. Passwords are never returned by the API.

### Inbound webhook

- URL: `POST /integrations/smtp/webhook/<token>`; get it with `smtpIntegrations.getInboundWebhook`, replace it with `rotateInboundWebhook`. The token is 256 random bits, created on first use, stored unhashed (the URL must be shown again) with a unique index. **It is the only credential**: treat the URL like a password and rotate it if it leaks. There is no provider signature check.
- The adapter is chosen from the inbox's provider (`integrations/smtp/src/inbound/webhook.ts`): SendGrid (`email` raw field), Mailgun (`body-mime`), Postmark (`RawEmail`) pass the source through. When a provider only sends parsed fields, a mail is rebuilt keeping `Message-ID`, `In-Reply-To`, `References` and the auto-reply headers. Attachments survive only in raw mode and for Postmark; Brevo sends none.
- Bounds: body read through a capped reader (15 MB, whatever `Content-Length` says), at most 50 mails per request (Brevo batches), 5 MB per mail (larger ones are acknowledged and dropped so the provider stops retrying). Retries of one mail share a job id derived from its `Message-ID`.

## Data

`IntegrationSmtp` carries `imapEnabled`, `imapHost`, `imapPort`, `imapMailbox`, the cursor, `lastPolledAt`, `lastPollError`, `imapNextPollAt` and `inboundToken`. The public resource exposes status fields (`imapEnabled`, `lastPolledAt`, `lastPollError`, `provider`, `inboundWebhookIssued`), never `auth` or the token.

## Operations

- A bad IMAP login shows in the settings list as "Last error" and in `lastPollError`; fix the credentials (saving resets the back-off).
- Microsoft is retiring basic auth for Exchange Online, so Outlook may refuse app passwords; the setup guide says so.
- Rate limiting per URL is not implemented; the size and count caps above bound one request.

## Setup guide (builder)

`features/integration-smtp/components/smtp-setup-guide.tsx` shows per-provider steps, a docs link and common errors in the connect and edit dialogs; copy is in `smtp.guide.*`. `smtp-receive-fields.tsx` renders the IMAP toggle (host/port for "Other") or the webhook URL box for relay providers.
