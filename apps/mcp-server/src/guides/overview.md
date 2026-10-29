# ChatbotX MCP overview

Use read tools to resolve IDs, names, permissions, and current state before requesting a change. `search_tools` discovers hidden operations; inspect the returned schema before calling `call_tool`.

Mutating tools may require approval. Clients with MCP elicitation display an approval form. Other clients receive `CONFIRMATION_REQUIRED`; show its proposed action and current state to the user, then retry the same tool with `_confirm: true` only after explicit approval. `_confirm` is a compatibility guardrail, not authorization.

Never treat a plan, validation response, queued job, or API error as a completed action. Do not retry a send, booking, publish, schedule, or other mutation unless the user requests it.

OAuth connections can require a browser redirect or user selection. Return the supplied URL or `nextAction` to the user, wait for the callback or selection result, then read the connection status before continuing.
