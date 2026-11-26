# Email channel (SMTP inbox)

An SMTP inbox is a two-way email channel. Agents and flows **send** from it, and incoming mail **opens and continues conversations** by IMAP polling or an inbound-parse webhook. Public API: `smtpIntegrations.*` (CLI: `chatbotx smtp-integrations …`).

## Identity and threading

- One contact per sender address: `ContactInbox.sourceId` is the lowercase sender email. Inbound email conversations are keyed by `Conversation.sourceId = email:<root Message-ID>`; legacy SMTP DMs remain unchanged.
- `Message.sourceId` is the RFC `Message-ID`; `threadSourceIds` records ancestry nearest-parent first. Thread headers are kept in `contentAttributes.email` (`subject`, `messageId`, `inReplyTo`, `references`, `from`, `to`, `cc`, `html`).
- Inbound routing first resolves a stored Message-ID or ancestor from the previous 90 days (including legacy DMs), then falls back to the `email:<root>` key. Missing or expired ancestry can fragment a thread; subjects are never used to merge it.
- **Sending** (`integrations/smtp/src/handlers/message/send-message.ts`): `From` is the inbox's `fromAddress`; replies use a selected parent message's subject, `In-Reply-To` and bounded `References`. The actual `Message-ID` and headers are returned in `OutgoingSendResult.email`.
- The inbox shows `contentAttributes.email.subject` above the message text. HTML is stored for reference and **never rendered**; the body is text only, with quoted history stripped (`inbound/quoted-reply.ts`).

### Delivery limits

- SMTP conversations use `email:<Message-ID>` as their source key. The root message id is retained so subsequent replies can find the thread.
- A reply can only be routed through an anchor stored during the preceding 90 days. Missing headers, old mail, or reply branches whose ancestor is unavailable can split one mail thread into multiple conversations. Subjects never merge conversations.
- If delivery succeeds but persisting its returned headers fails, a later inbound reply can route to a new branch. The root `References` header normally lets later replies converge.
- Legacy SMTP DMs remain visible with their mixed history. Assigning by contact still assigns every conversation for that contact.

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
- Bounds: body read through a capped reader (15 MB, whatever `Content-Length` says), at most 50 mails per request (Brevo batches), 5 MB per mail (larger ones are acknowledged and dropped with a warning so the provider stops retrying; IMAP polling does the same, logging each skipped UID and moving the cursor past it). Retries of one mail share a job id derived from its `Message-ID`.

## Data

`IntegrationSmtp` carries `imapEnabled`, `imapHost`, `imapPort`, `imapMailbox`, the cursor, `lastPolledAt`, `lastPollError`, `imapNextPollAt` and `inboundToken`. The public resource exposes status fields (`imapEnabled`, `lastPolledAt`, `lastPollError`, `provider`, `inboundWebhookIssued`), never `auth` or the token.

## Operations

- A bad IMAP login shows in the settings list as "Last error" and in `lastPollError`; fix the credentials (saving resets the back-off).
- Microsoft is retiring basic auth for Exchange Online, so Outlook may refuse app passwords; the setup guide says so.
- Rate limiting per URL is not implemented; the size and count caps above bound one request.

## Setup guide (builder)

`features/integration-smtp/components/smtp-setup-guide.tsx` shows per-provider steps, a docs link and common errors in the connect and edit dialogs; copy is in `smtp.guide.*`. `smtp-receive-fields.tsx` renders the IMAP toggle (host/port for "Other") or the webhook URL box for relay providers.
