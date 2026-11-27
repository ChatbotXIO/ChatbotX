## Existing Integrations Reference

**Channel vs integration.** Not every integration is a channel. `channelTypes`
(`packages/utils/src/channel.ts:18`) is exactly: `omnichannel`, `webchat`, `messenger`,
`whatsapp`, `zalo`, `line`, `smtp`, `telegram`, `instagram`, `threads`, `tiktok`, `api`. Entries below that are
not in that list (`google-sheets`, `instagram-facebook`, …) are `integrationTypes` only —
they connect an external service but carry no inbox conversation.


| Integration         | Auth type | Platform credentials? | Notes                                                                                                                              |
| ------------------- | --------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| messenger           | OAuth2    | YES                   | clientId/clientSecret as platform credential                                                                                       |
| whatsapp            | OAuth2    | YES                   | clientId/clientSecret + systemUser as platform credential                                                                          |
| zalo                | OAuth2    | YES                   | clientId/clientSecret as platform credential                                                                                       |
| line                | Custom    | NO                    | Per-workspace Channel ID + Channel secret (no platform credential); 30-day short-lived v2 token minted from client credentials; HMAC `x-line-signature` webhook; reply-then-push sending; 1:1 only. See `docs/line.md` |
| tiktok              | OAuth2    | YES                   | clientId/clientSecret as platform credential                                                                                       |
| threads             | OAuth2    | YES                   | Meta Threads app (clientId/clientSecret) as platform credential; comments only — public reply + hide top-level replies, no DM API and no like; see the `comment-automation` skill |
| google-sheets       | OAuth2    | YES                   | clientId/clientSecret as platform credential                                                                                       |
| instagram-facebook  | OAuth2    | YES                   | Meta/Facebook app (clientId/clientSecret); auth via Facebook Graph API for Instagram Business/Creator accounts linked to FB Pages; handles DMs + post comments; Personal accounts filtered out; integration name in code: `instagramFacebook` |
| smtp                | Custom    | NO                    | SMTP with provider presets                                                                                                         |
| webchat             | Custom    | NO                    | Realtime gateway-based                                                                                                               |
| chatbotx            | Custom    | NO                    | Internal chatbot                                                                                                                   |
