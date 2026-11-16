# Instagram integration

ChatbotX supports two authentication modes through the same `instagram`
provider:

- **Instagram Login** (legacy/direct): leave the Unified Login configuration
  ID empty. ChatbotX uses `instagram.com/oauth/authorize` and the existing
  Instagram token refresh flow.
- **Meta Unified Login**: set the optional Unified Login configuration ID.
  ChatbotX uses Facebook Login for Business, discovers
  `assigned_instagram_accounts`, and lets the user select one or more returned
  professional accounts.

Existing direct-login credentials keep their previous behavior when the new
field is empty.

## Meta Unified Login setup

In **Admin → Platform credentials → Instagram**, configure:

- Meta App ID and App Secret;
- webhook verify token;
- Graph API version; and
- Unified Login Configuration ID (`config_id`).

Configure the Meta login with this callback URL:

```text
https://<chatbotx-host>/integrations/instagram/callback
```

Configure the Instagram webhook object with:

```text
https://<chatbotx-host>/integrations/instagram/webhook
```

Subscribe the app-level webhook to the fields used by the installation,
including `messages`, `messaging_postbacks`, `message_reactions`, `comments`,
and `live_comments`. ChatbotX separately registers those fields on each
selected account through `subscribed_apps`; both levels are required.

The Unified Login configuration must issue a **Business Integration System
User token**, not a user access token. ChatbotX deliberately does not pass this
token to the legacy `ig_refresh_token` endpoint. Configure a non-expiring
system-user token for this implementation. Expiring system-user tokens require
rotation support that this integration does not currently implement; if such a
token expires, reconnect the account after updating the Meta configuration.

The required permissions depend on the enabled features and include
`instagram_business_basic`, `instagram_business_manage_messages`, and
`instagram_business_manage_comments`. Live use outside app-role accounts may
also require App Review, Advanced Access, and Business verification.

## Agent/API connection behavior

`connections.create` returns an OAuth URL. After the person completes Meta's
dialog, a session with exactly one selectable Instagram account completes
automatically. A session with multiple selectable accounts moves to
`awaiting_selection`; call `connectSessions.get` and then
`connectSessions.connectTargets` with the chosen target IDs.
