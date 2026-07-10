# Code Style Preference

Prefer straightforward code over compact cleverness.

- Use explicit `if` blocks when a ternary or chained fallback would make control flow harder to scan.
- Avoid nested ternaries and avoid `condition ? a : b` for non-trivial value building.
- Helper names should be short but meaningful. Prefer names like `loadContact`, `loadInbox`, `loadWorkspace`, `loadFields`, `formatDate`, and `formatDateTime` over long names such as `findContactOrThrow` or `resolveContactInbox` unless the longer name carries necessary meaning.
- Keep functions linear and boring. Move query/loading/mapping details into small helpers when the main function starts mixing several responsibilities.
- Do not shorten names so much that meaning is lost. A name should explain what the helper returns or does without needing to inspect its body.
- Prefer early returns and simple guard clauses.
- Use nullish fallback (`??`) only for simple value fallback. If a fallback involves querying, mapping, formatting, or branching behavior, use an explicit `if`.

