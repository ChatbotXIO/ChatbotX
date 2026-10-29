# Places Near Me — locations & categories management

Date: 2026-10-25
Branch context: `feat/places-near-me`
Entry point: the existing `places-near-me` card in
`apps/builder/src/features/tools/tools-list.tsx` (currently has no link).

## Intent

Businesses with several physical locations want their customers to find the
nearest one from a chat. This release builds the **data side only**: a tool
where a workspace manages its business **Locations** (name + coordinates) and
groups them into **Categories**. A later, separate project will ask the
customer for their location in a flow and send them the nearest place(s);
the data model here must serve that later feature without migration.

Tool card description (en): **"Let your customers easily find your business
locations near them."** (replaces the current `placesNearMe.description`).

## Goals

- A **Places Near Me** page reachable from the Tools card, with two tabs:
  **Locations** (default) and **Categories**.
- **Categories** CRUD: name + rank. Table actions: **Edit**, **Delete**.
- **Locations** create / edit / delete: name, latitude, longitude, optional
  category. Table actions: **Preview**, **Delete**; clicking the row opens the
  edit dialog.
- **Preview** opens a new browser tab at
  `https://www.google.com/maps/search/?api=1&query=<lat>%2C<long>`
  (e.g. `…query=16.0078846304474%2C108.26602981877288`).
- Locations table has **search by name**.
- A **public API** for every operation (AGENTS.md invariant 23), built
  **before** the UI; UI and API call the same service methods.

## Non-goals (this release)

- Anything customer-facing: no flow step, no "request user location", no
  nearest-place query, no public map/webview page.
- Category images (explicitly dropped).
- Subcategories.
- Extra location fields (address, phone, image, description, opening hours).
- Bulk/CSV import (not now; agents can bulk-create via the public API/CLI).
- Map picker or Google Maps URL parsing.
- Category filter on the Locations table; search by coordinates.

## Anti-goals

- A UI-only feature with no public API, or separate UI/API implementations.
- Losing locations when a category is deleted.
- Storing coordinates with reduced precision (the example has 13–14 decimal
  places; preview must round-trip exactly what the admin entered).
- A data model the later "send nearest place" feature can't use as-is
  (e.g. rank whose meaning is ambiguous).

## Decisions (made by the user)

### Category
- Fields: **name**, **rank**. No image, no subcategories.
- **Name unique per workspace**, case-insensitive.
- **Rank = priority among nearby results** for the future nearest-place
  feature: when places are about equally close, the better-ranked category
  wins. **Lower number = higher priority** (rank 1 beats rank 10).
  **Default 10.** Uncategorized locations count as lowest priority.
- Rank lives on the **category only**. No per-location rank; one can be added
  later if ever needed. What counts as "about equally close" is defined by
  the later feature (a query-time setting, not schema).
- Table actions: Edit, Delete.
- Deleting a category **leaves its locations uncategorized** (FK
  `ON DELETE SET NULL`).

### Location
- Fields: **name**, **latitude**, **longitude**, **category (zero or one)**.
  Nothing else.
- Location names are **not** unique. Duplicate coordinates are **allowed**
  (e.g. a store and a service desk in the same building).
- Coordinate input: **two number fields** (latitude −90..90, longitude
  −180..180). **Pasting `lat, long` into the latitude field** (e.g. Google
  Maps right-click copy `16.0078, 108.2660`) splits and fills both fields.
- Table columns: **Name**, **Coordinates** (`lat, long`). Plus actions.
- **Click the row to edit**; the action menu stays Preview + Delete.
- Search matches **name**, case-insensitive contains.

### Tool card
- Visible to **everyone with Tools access** (no `permission`, no beta badge).

## Builder's calls (decided by Claude, flag if wrong)

- **Route:** `/space/[workspaceId]/places-near-me`, tab in `?tab=locations|categories`
  (mirrors `fb-marketing-messages`' `parse…Tab` pattern; unknown → locations).
  Breadcrumb `Tools › Places Near Me`.
- **Feature folder:** `apps/builder/src/features/places-near-me/` with
  `api/{public,authorized,index}.ts`, `schema/`, `components/`, `lib/`.
  Mirror `product-categories` for the category form/dialog and its
  `rank-select-field` (`ecommerce-settings/components/rank-select-field`).
- **Tables:** `PlaceCategory` (id, workspaceId, name, rank int default 10 not
  null, timestamps; unique index on `(workspaceId, lower(name))`) and
  `PlaceLocation` (id, workspaceId, name, latitude, longitude,
  placeCategoryId nullable FK `ON DELETE SET NULL`, timestamps; index on
  `workspaceId`). Coordinates as `double precision` (~15–17 significant
  digits; covers the example exactly). Both cascade-delete with the workspace.
  No PostGIS — the future distance query can use haversine over
  `double precision` at this scale; revisit if a workspace has very many
  locations.
- **Data access:** services in `packages/business/src/place-near-me/`,
  repositories in `packages/database/src/repositories/`; remember the
  relations/index.ts double edit (invariant 2).
- **API token scope:** new scope `places` added to
  `workspaceApiTokenScopes` (`packages/database/src/partials/workspace-api-token.ts`),
  matching how `minigames` / `leaderboards` got their own scope. No migration
  needed (scopes are `text[]`).
- **Public procedures** (names indicative): `placeCategories.list|get|create|update|delete`,
  `placeLocations.list|get|create|update|delete`. `placeLocations.list`
  takes `search` (name) + pagination and returns `categoryId`/`categoryName`.
  Location responses also return `previewUrl` (the Google Maps URL), so an
  agent gets the same result the Preview button produces. Descriptions say
  `categoryId` comes from `placeCategories.list`. Run the `cli-mcp-docs`
  skill afterwards.
- **Category table:** columns Name, Rank, Locations (count); sorted by rank
  ascending then name. Not paginated server-side unless the count is large
  (follow product-categories).
- **Locations table:** paginated server-side, newest first, name search
  debounced.
- **Category dropdown** in the location form: sorted by rank then name, with a
  "No category" option.
- **Delete confirmations:** both use a confirm dialog; the category dialog
  says its N locations will become uncategorized.
- **Duplicate category name** → field-level error on name.
- **Rank range:** whatever the shared rank select offers (same as product
  categories); API validates a positive int.
- **Paste split:** only triggers when the pasted text matches
  `^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$`; otherwise normal paste.
  Values keep full pasted precision (no rounding).
- **Scope rollout:** tokens with `scopes = null` ("All scopes", including
  the default `{{api_key}}` token) get `places` automatically. Tokens with an
  explicit scope list don't, and there's no backfill, the same as when
  `minigames`/`leaderboards` were added. The docs say to edit the token to
  add the scope.
- **Page gate:** the Tools page has no dedicated permission, so the Places
  page is gated by workspace membership (`getCurrentUserAndTargetWorkspace`),
  and the API by token scope `places`.
- **Coordinates in the API:** JSON numbers only (no numeric strings),
  validated to range. `previewUrl` is built from the stored `double`.
  Precision is tested with the example values round-tripping exactly.
- **API category delete:** allowed without confirmation. The response
  returns `uncategorizedLocationCount` so agents can see what changed.
- **Duplicate category name in the API:** `CONFLICT` (409). Renaming a
  category to a different-case version of its own name is allowed (the
  uniqueness check excludes the row itself).
- **No batch endpoint:** creates are one at a time. Page size is capped like
  other list procedures (max 100).
- **Quotas:** none in v1.
- **i18n:** every string via `useTranslations()`; update
  `placesNearMe.description` in all locale files (en text above; other locales
  translated).
- **TanStack invalidation** after every mutation (invariant 21).

## What's left to the builder

Component layout details, exact procedure names/paths, test placement
(per AGENTS.md), and empty-state copy.
