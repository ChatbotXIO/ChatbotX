# Skill Card

## Description

ChatbotX CLI wraps the ChatbotX workspace REST API into command-line verbs — contacts,
conversations, broadcasts, flows, sequences, appointments, minigames, analytics, and every other
workspace resource — so a terminal or an AI agent can operate a ChatbotX workspace directly.

This skill is ready for commercial/non-commercial use.

## Owner

ChatbotXIO — `apps/cli` maintainers (github.com/ChatbotXIO/ChatbotX).

## License/Terms of Use

This skill package (SKILL.md, skill-card.md, and this folder) is published to ClawHub under
MIT-0, per ClawHub's publishing policy. The underlying `chatbotx` npm CLI and the ChatbotX
platform it talks to are licensed separately — see `LICENSE` at the repository root
(AhaChat LLC, with third-party and enterprise-directory exceptions listed there). Using this
skill still requires a ChatbotX workspace and API key subject to ChatbotX's own terms of service.

## Use Case

External developers and AI agents that already hold a ChatbotX workspace API key, automating
contact management, conversation handling, broadcast scheduling, flow/sequence publishing, and
analytics retrieval against that workspace from a CLI or agent runtime.

## Deployment Geography for Use

Global — the CLI talks to whatever `--apiUrl` / `CHATBOTX_API_URL` is configured (ChatbotX SaaS
or a self-hosted instance); it has no built-in geographic restriction.

### Requirements / Dependencies

Requires API Key or External Credential: Yes
Credential Type(s): API key (ChatbotX workspace API key, `CHATBOTX_API_KEY` / `chatbotx config set --apiKey`)

Do not include secrets in prompts/logs/output; use a least-privilege workspace API key; rotate keys
as appropriate.

## Known Risks and Mitigations

Risk: The CLI can send real messages and broadcasts to a workspace's actual contacts
(`contacts message send`, `conversations message send`, `broadcasts create`) — a wrong `--text`,
`--accounts`/audience filter, or premature schedule reaches live customers.
Mitigation: Verify recipient count first with `contacts count --contactFilter <filter>` or
`broadcasts audience list`; use `broadcasts create --saveAsDraft` and review before scheduling or
sending.

Risk: Several commands are workspace-wide and irreversible — `contacts bulk-delete`,
`contacts custom-field delete` (clears **every** custom field on the contact due to a documented
command-name collision, not one field), `minigames bulk-delete`, `broadcasts delete`. There is no
dry-run flag.
Mitigation: Resolve and review exact target ids/filters with the matching `list`/`get` command
before running a bulk or delete command; consult the "Known command-name collisions" section of
this skill's `SKILL.md` before relying on a delete-by-id or update-by-id variant.

Risk: Credentials are stored in plaintext at `~/.chatbotX/config.json` (or shell environment
variables) and sent with every request to the configured API URL.
Mitigation: Treat `~/.chatbotX/config.json` as a secret file; use a scoped API key; only pass
`--allowSelfSignedCert` against a trusted local/dev instance, never a production endpoint.

Risk: Generated commands come from the workspace's live OpenAPI spec (cached for 1 hour at
`~/.chatbotX/openapi-cache.json`); a stale cache can make a recently added/changed API invisible or
mis-shaped to the CLI.
Mitigation: Pass `--refresh-spec` (or set `CHATBOTX_SPEC_CACHE_TTL_SECONDS`) after a known API
change, and confirm a write with a follow-up `get`/`list` rather than trusting the command's own
exit code alone.

## References

- This skill's `SKILL.md` — full command reference and command-name collision table.
- `apps/cli/README.md` in the source repository — hand-maintained, more detailed CLI reference.
- Source repository: https://github.com/ChatbotXIO/ChatbotX/tree/main/apps/cli

## Skill Output

Output type(s): API calls, structured data, shell command guidance

Output format: JSON for every `chatbotx` command result (`--pretty` for indented output); Markdown
for this skill's own instructions. Errors are always `{"error": true, "message": "...", "status": <httpCode>}`.

Output parameters: 1D — each command returns a flat JSON object or array from one API response; no
multi-command batching or transactions.

Other properties: Write commands mutate live workspace data (contacts, conversations, broadcasts,
flows, and more) and some trigger outbound messages to real end users or upload media to external
storage; there is no dry-run mode.

## Skill Version

1.0.0 (matches this skill's `SKILL.md` frontmatter `version`)

## Ethical Considerations

ChatbotXIO treats safe use of customer-messaging automation as a shared responsibility. Agents
operating this skill should confirm they are authorized to contact the workspace's audience,
comply with applicable messaging and anti-spam rules (e.g. GDPR, CAN-SPAM, and the messaging
policies of each connected channel — WhatsApp, Messenger, Instagram, Zalo, Telegram, email), and
avoid sending broadcasts, flows, or bulk operations against a production workspace without human
review. Report quality, security, or misuse concerns via the source repository's issue tracker.

This template follows the NVIDIA Skill Card format (github.com/NVIDIA/Trustworthy-AI, CC0),
adapted for this skill.
