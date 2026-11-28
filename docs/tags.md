# Tags

A workspace tag has a `name` (unique per workspace), an optional `folderId` and an optional `color`.

## Color

- `Tag.color` is nullable text, `#RRGGBB` (either case, no alpha). `null` means the default (uncolored) look.
  Validation lives in `@chatbotx.io/utils/color` (`hexColorSchema`, `HEX_COLOR_PATTERN`), which also has
  `readableTextColor(hex)`: dark or light text, whichever has the higher WCAG contrast on that background.
  Every place that paints a tag (table swatch, conversation row chips, composer grid) uses it.
- On `tags.create` and `tags.update` (public API `POST /v1/tags`, `PUT /v1/tags/{id}`, and the dialogs):
  `color` omitted keeps the current color, `null` clears it, a string sets it. `tags.get`, `tags.list` and
  `contacts.listTags` return `color`.
- The lock policy of a template-installed tag is `["name"]`, so its color stays editable. See
  `docs/templates.md` ("Tag color") for how colors travel in a template.
- A color change reaches conversation-list rows of other open clients on their next list refresh (the
  `contactTagsChanged` realtime event covers tag *links*, not tag edits); the acting client refreshes at once.

## Composer tag grid

Above the Inbox composer, every workspace tag is shown as a chip (infinite query on the private tag list, 50
per page, with search; collapsed to about three rows, expandable). A dot marks the tags the open contact has.

- A click adds or removes the tag through `addContactTagAction` / `removeContactTagAction`. One request per
  tag at a time: clicks during a request only replace the queued intent, which is sent when the request
  settles (`features/messages/lib/tag-toggle-queue.ts`).
- When a tag has nothing left in flight the contact (`getContactAuthenticatedAPI`) is re-read, so the grid
  and the contact panel show the server's state, including changes made meanwhile by other agents or flows.
  There is no rollback from client memory. A failed request shows a toast.
- Read-only (chips disabled, with a reason) when the conversation has no contact, the contact is blocked, or
  the contact cannot be read (no contacts permission, or outside the member's assigned-contacts scope).
