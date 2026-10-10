# @chatbotx.io/mini-app

Rules for Mini Apps — multi-screen forms that follow the WhatsApp Flows
standard (Flow JSON `7.3`). The builder editor, the public web runner and the
server all import this package, so they agree on:

- the component catalog (what can be added, where, and how many per screen),
- the editor definition model (`MiniAppDefinition`) and its tree helpers,
- `toFlowJson` / `fromFlowJson` — conversion to and from Meta's Flow JSON,
- `validateMiniApp` — Meta's structural rules, reported as typed issue codes,
- `evaluateExpression` / `interpolate` — the `${form.x}` expression runtime
  used by `If` / `Switch` and text bindings (no `eval`).

Only endpoint-less Flows are supported: actions are `navigate`, `complete`
and `open_url`. `data_exchange` / `update_data` are rejected on import.
