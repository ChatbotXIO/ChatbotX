# Import conventions, layout and i18n

## Import Conventions

| What | Path |
|------|------|
| App internal | `@/features/<feature>/...`, `@/lib/...`, `@/components/...` |
| Shared UI | `@chatbotx.io/ui/components/ui/<component>` (via the package's `exports` map) |
| Business services | `@chatbotx.io/business` — the only way to reach data from a feature |
| Types | `@chatbotx.io/database/types` |
| Shared helpers | `@chatbotx.io/utils` (`getIdFromParams`, `zodBigintAsString`, …) |
| oRPC client | `@/lib/orpc/orpc` |
| oRPC stacks | `@/orpc` (for `authorizedAPI`, `workspaceTokenAuthAPIForScope`) |
| Auth middleware | `@/middlewares/auth` |
| Safe action clients | `@/lib/safe-action` |

`@chatbotx.io/database/client` and `@chatbotx.io/database/schema` are **not**
importable from `apps/builder/src/features/*` — see `.agents/rules/data-access.md`.

## Layout Patterns

- **Route groups** `()` organize without URL segments: `(settings)`, `(has-folder)`, `(ai)`
- **Parallel routes** `@slot` for multi-panel layouts — but NOT for the folder bar: rendered inside a page's table card a slot never resolves and suspends the whole table
- **Folder bar** (`(has-folder)` pages): pass the page's `folderType` explicitly. If a client table renders the card, wrap the page in `WithFolderBar` (`@/features/folders/with-folder-bar`) and place `<FolderBarSlot />` at the top of the table's `CardContent`, outside the `Suspense` that waits for table data. If the page renders the card itself, put `<SharedFolderSlot folderType=… />` straight into `CardContent`
- **Route-driven accordions** for the channels/integrations settings lists: each row is a real nested route (`settings/channels/<channel>`, `settings/integrations/<slug>`) rendered through the shared `RouteAccordionShell` (`@/components/route-accordion-shell`) with `prefetch={false}`, so only the active row's server/client graph loads — do NOT convert these back to slots or eager panels
- **Workspace layout** at `space/[workspaceId]/layout.tsx`: auth, sidebar, workspace context
- Server layouts: auth checks, data loading
- Client layouts: tabs, accordions, interactive navigation

## Internationalization (i18n)

All user-facing text **must** use `useTranslations()` — never hardcode a label, placeholder,
button, or toast. Reuse existing `fields.*` / `actions.*` / `messages.*` keys before adding new
ones, and add every new key to **all** locale files in `apps/builder/messages/` (the parity
check in `pnpm lint` fails otherwise).

Full rules — namespaces, form-field reuse, dynamic keys, RTL — are in the **`builder-ui-i18n`**
skill. Read it for any UI work; it is not duplicated here.
