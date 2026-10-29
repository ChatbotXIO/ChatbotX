# Find Places Near Me Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Perform Action `More options › Find places near me` that reads the contact's location from an upstream Get User Data (Location) field, finds the nearest place location (one category or all), and sends it as a WhatsApp location message.

**Architecture:** A new `findPlacesNearMe` step in `@chatbotx.io/flow-config` plus a pure graph helper that finds upstream location fields. The worker handler runs that helper on the executed flow version, reads the newest valid `lat,lng` value through `contactCustomFieldService`, asks `placeLocationService.findNearest`, and enqueues a `whatsappLocation` step through the existing `sendFlowMessage` path. The builder adds the menu entry, an editor item with a category select (fed by a new private oRPC options procedure) and an upstream-source warning, and a name-only viewer.

**Tech Stack:** zod (flow-config), Drizzle repositories, `@chatbotx.io/business` services, BullMQ worker handlers, Next.js 16 + React Flow + react-hook-form + TanStack Query + oRPC, next-intl, vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-find-places-near-me-action-design.md`

## Global Constraints

- Read first: `.agents/skills/flow-step-development`, `business-data-access`, `orpc-api`, `builder-ui-i18n`, `testing-workflow`.
- Chain: worker / API handler → service → repository → DB. No `db` import in `apps/`.
- No dynamic `import()` in `packages/*` or `apps/worker`.
- Only WhatsApp contacts get a message: `contactInbox.channel === "whatsapp"`.
- Message: `whatsappLocation` step with `latitude`, `longitude`, `name` = location name. **No address.**
- Pure nearest by great-circle distance; rank ignored; no distance limit; ties → lower `id` (string compare by `BigInt`).
- No freshness check: use the newest (`ContactCustomField.updatedAt` desc) source value that parses as a valid `lat,lng` (lat −90..90, lng −180..180).
- Bot-field sources (`bot_field:<id>`, `isBotFieldReference`) are ignored everywhere.
- Every "can't send" case is a silent skip: handler returns normally, logs `logger.info({ conversationId, stepId, reason }, "findPlacesNearMe: skipped")`. Reasons: `notWhatsapp`, `noLocationSource`, `noLocationValue`, `noPlaceFound`. Errors use the `err` key (invariant 20).
- No public API (flow-only). The PR description must state: "Invariant 23 exemption: findPlacesNearMe is a flow-runtime side effect on a live conversation; the step is configured through the existing flows API."
- Every user-facing string via `useTranslations()`, present in **all 21** `apps/builder/messages/*.json` locales (`pnpm --filter builder i18n:check`).
- The new TanStack options query must be invalidated after place-category create/update/delete (invariant 21).
- Commits: stage specific files only; conventional commits (`.agents/rules/git.md`).
- Done = `pnpm lint`, `pnpm --filter builder check-types`, `pnpm --filter worker check-types`, `pnpm --filter @chatbotx.io/flow-config check-types`, `pnpm --filter @chatbotx.io/business check-types` pass.

## Review Focus

1. **Cycles in the flow graph** (A → B → A): the upstream walk must terminate and still return sources (Task 1 test `handles cycles`).
2. **Get User Data on a branch that is not upstream** (a sibling branch, or downstream of the action): must not count as a source (Task 1 test `ignores non-upstream steps`).
3. **Legacy name-keyed `outputFieldId`** (a field name instead of an id): must still resolve to the contact's value (Task 3 test `resolves name keys`).
4. **Newest value is garbage** (`"hello"`) while an older source holds a valid pin: fall through to the older one (Task 4 test `falls through invalid newest value`).
5. **Category deleted after publish / category from another workspace** (e.g. imported flow): the action skips, never sends a place from another workspace (Task 2 test `scopes by workspace and category`, Task 4 test `skips when no place found`).

---

### Task 1: `findPlacesNearMe` step schema + upstream location helper (flow-config)

**Files:**
- Create: `packages/flow-config/src/steps/find-places-near-me.ts`
- Create: `packages/flow-config/src/steps/upstream-location-fields.ts`
- Modify: `packages/flow-config/src/steps/step-action.ts` (add `"findPlacesNearMe"` to `stepTypes`, in a new `// More options` group)
- Modify: `packages/flow-config/src/shared.ts` (new `const moreOptionsSteps = [findPlacesNearMeStepSchema]`, spread into `actionSteps`)
- Modify: `packages/flow-config/src/channel-rules/policies/define.ts` (`findPlacesNearMe: "worker"` in `stepExecutionKinds`)
- Modify: `packages/flow-config/src/import-export/reference-fields.ts` (`placeCategoryId: "placeCategory"` in `REFERENCE_FIELD_ENTITY_KIND`, warn-only comment)
- Modify: the flow-config barrel (`packages/flow-config/src/index.ts`) to export both new modules if steps aren't already re-exported wholesale
- Test: `packages/flow-config/__tests__/find-places-near-me.test.ts`

**Interfaces — Produces:**
- `findPlacesNearMeStepSchema` = `baseStepSchema.extend({ stepType: z.literal(stepTypes.enum.findPlacesNearMe), placeCategoryId: zodBigintAsString().nullable().describe("Place category id from placeCategories.list; null = all locations.") })`
- `type FindPlacesNearMeStepSchema`
- `findPlacesNearMeStepDefaultFn(): FindPlacesNearMeStepSchema` → `{ id: createId(), stepType: "findPlacesNearMe", placeCategoryId: null }`
- `type LocationGraphNode = { id: string; data?: { details?: { steps?: ReadonlyArray<{ id: string; stepType: string; replyFormat?: string; outputFieldId?: string }> } } }`
- `type LocationGraphEdge = { source: string; target: string }`
- `findUpstreamLocationFieldKeys(input: { nodes: readonly LocationGraphNode[]; edges: readonly LocationGraphEdge[]; stepId: string }): string[]` — locate the node whose `data.details.steps` contains `stepId`; BFS backwards over `edges` (target → source) with a visited set, starting from that node's predecessors (the action's own node is not scanned); collect `outputFieldId` of every step with `stepType === "getUserData"`, `replyFormat === ReplyFormat.location`, non-empty `outputFieldId`, and `!isBotFieldReference(outputFieldId)`. Return unique keys in discovery order. Unknown `stepId` → `[]`. Typed structurally so both React Flow nodes and `FlowVersionModel["nodes"]` fit.

- [ ] **Step 1: Write the failing tests** in `find-places-near-me.test.ts` (build tiny graphs inline: `node(id, steps)`, `edge(source, target)`; location step = `{ id, stepType: "getUserData", replyFormat: "location", outputFieldId }`):
  - `schema accepts null and a numeric category id, rejects "abc"`
  - `defaultFn has placeCategoryId null`
  - `finds a location field two nodes upstream`: A(gud f1) → B(text) → C(action s1) ⇒ `["f1"]`
  - `collects every branch`: A(gud f1) → C, B(gud f2) → C ⇒ both `f1`, `f2` (`expect.arrayContaining`, length 2)
  - `ignores non-upstream steps`: C(action) → D(gud f3) and sibling E(gud f4) unconnected ⇒ `[]`
  - `ignores non-location reply formats and empty outputFieldId`
  - `ignores bot fields`: `outputFieldId: "bot_field:12"` ⇒ `[]`
  - `handles cycles`: A(gud f1) → B → C(action) → A ⇒ `["f1"]`, terminates
  - `unknown step id returns []`
  - `dedupes`: two upstream steps both writing `f1` ⇒ `["f1"]`
- [ ] **Step 2:** `pnpm --filter @chatbotx.io/flow-config test -- find-places-near-me` → FAIL (module not found).
- [ ] **Step 3:** Implement both modules and the registrations listed under Files. Then run `pnpm --filter @chatbotx.io/flow-config check-types`; fix any exhaustive `Record<StepType, …>` it flags inside flow-config (`channel-rules/validators.ts` is partial — leave it unless it errors).
- [ ] **Step 4:** `pnpm --filter @chatbotx.io/flow-config test` → PASS (whole package, so channel-policy contract tests catch a missing registration).
- [ ] **Step 5: Commit** `feat(flow-config): add findPlacesNearMe step and upstream location helper`

### Task 2: Nearest place lookup (repository + service)

**Files:**
- Modify: `packages/database/src/repositories/place-location/repository.ts`
- Create: `packages/business/src/place-near-me/nearest.ts`
- Modify: `packages/business/src/place-near-me/location.service.ts`, `packages/business/src/place-near-me/index.ts` (export)
- Test: `packages/business/src/place-near-me/__tests__/nearest.test.ts`, extend `packages/business/src/place-near-me/__tests__/location-service.test.ts`

**Interfaces — Produces:**
- `placeLocationRepository.listCoordinates(input: { workspaceId: string; categoryId: string | null }, tx?: DatabaseClient): Promise<{ id: string; name: string; latitude: number; longitude: number }[]>` — `where workspaceId = ? [and categoryId = ?]`; `categoryId === null` means all locations (including uncategorized).
- `type NearestPlace = { id: string; name: string; latitude: number; longitude: number; distanceKm: number }`
- `haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number` — Earth radius `6371`.
- `pickNearestPlace(origin, places): NearestPlace | null` — min distance; tie → smaller `BigInt(id)`; empty → `null`.
- `placeLocationService.findNearest(input: { workspaceId: string; categoryId: string | null; latitude: number; longitude: number }): Promise<NearestPlace | null>` — no cache.

- [ ] **Step 1: Write the failing tests:**
  - `nearest.test.ts`: `haversineKm Hanoi→HCMC ≈ 1137 km` (`{21.0285,105.8542}` → `{10.8231,106.6297}`, `toBeCloseTo(1137, -1)`); `haversineKm same point is 0`; `pickNearestPlace picks the closest`; `pickNearestPlace breaks ties by lower id` (ids `"10"` and `"9"` at equal distance ⇒ `"9"`); `pickNearestPlace returns null for []`; `antimeridian`: origin `{0,179.9}`, places at `{0,-179.9}` and `{0,170}` ⇒ the `-179.9` one.
  - `location-service.test.ts` (existing mock style): `findNearest passes workspace and category to listCoordinates` (`categoryId: null` and `"7"` both forwarded verbatim) — name it `scopes by workspace and category`; `findNearest returns null when the repository returns []`.
- [ ] **Step 2:** `pnpm --filter @chatbotx.io/business test -- place-near-me` → FAIL.
- [ ] **Step 3:** Implement the repository method, `nearest.ts`, and `findNearest`.
- [ ] **Step 4:** Re-run → PASS. `pnpm --filter @chatbotx.io/database check-types && pnpm --filter @chatbotx.io/business check-types` → pass.
- [ ] **Step 5: Commit** `feat(places-near-me): find the nearest place location`

### Task 3: Read the newest valid location from contact fields

**Files:**
- Modify: `packages/business/src/get-user-data/reply-input.combinators.ts` (extract parser; `asCoordinatePair` uses it, behavior unchanged)
- Modify: `packages/business/src/contact-custom-field/service.ts`
- Create: `packages/business/src/place-near-me/contact-location.ts`; export from `packages/business/src/place-near-me/index.ts`
- Test: `packages/business/src/place-near-me/__tests__/contact-location.test.ts`, and a case in the existing contact-custom-field service tests (find the file with `grep -rl "contactCustomFieldService" packages/business/src/contact-custom-field/__tests__`)

**Interfaces — Produces:**
- `parseCoordinatePair(text: string): { latitude: number; longitude: number } | null` (exported from `reply-input.combinators.ts`, same `COORDINATE_PAIR_PATTERN` and range checks as today).
- `contactCustomFieldService.listValuesByKeys(input: { workspaceId: string; contactId: string; keys: string[] }): Promise<{ key: string; value: string; updatedAt: Date }[]>` — resolve each key as id (numeric, scoped to workspace) **or** name, mirroring `setValueByKey`; ignore keys that resolve to nothing and bot-field tokens; return the contact's existing values ordered `updatedAt desc`. `keys: []` → `[]` without querying.
- `findContactLocation(input: { workspaceId: string; contactId: string; keys: string[] }): Promise<{ latitude: number; longitude: number } | null>` — first row from `listValuesByKeys` whose value `parseCoordinatePair` accepts.

- [ ] **Step 1: Write the failing tests:**
  - `parseCoordinatePair`: `"16.0078846304474,108.26602981877288"` round-trips exactly; `"91,0"` → null; `"hello"` → null; `" 10.5 , -20 "` accepted.
  - `contact-location.test.ts` (mock `listValuesByKeys`): `returns the newest valid value`; `falls through invalid newest value` (`[{value:"hello"}, {value:"1,2"}]` ⇒ `{1,2}`); `returns null when there are no rows`.
  - contact-custom-field test `resolves name keys`: a key that is a field name (not numeric) returns that field's value; a `bot_field:3` key returns nothing.
- [ ] **Step 2:** `pnpm --filter @chatbotx.io/business test -- contact-location reply-input contact-custom-field` → new tests FAIL.
- [ ] **Step 3:** Implement. Existing get-user-data tests must still pass unchanged.
- [ ] **Step 4:** Re-run the same command plus `pnpm --filter @chatbotx.io/business test -- get-user-data` → PASS.
- [ ] **Step 5: Commit** `feat(places-near-me): read a contact's latest location from custom fields`

### Task 4: Worker handler

**Files:**
- Create: `apps/worker/src/integration/handlers/find-places-near-me.ts`
- Modify: `apps/worker/src/integration/handlers/step.ts` (`[stepTypes.enum.findPlacesNearMe]: findPlacesNearMe` in `flowStepHandlers`)
- Modify: `apps/worker/src/integration/handlers/flow-utils.ts` (`findPlacesNearMe: false` in `STEP_PRODUCES_MESSAGE` — it does not carry the comment anchor)
- Test: `apps/worker/__tests__/find-places-near-me-step.test.ts` (mock style of `clear-custom-field-step.test.ts`)

**Interfaces — Consumes:** Task 1 `findUpstreamLocationFieldKeys`, `FindPlacesNearMeStepSchema`; Task 2 `placeLocationService.findNearest`; Task 3 `findContactLocation`; existing `sendFlowMessage` (`step.ts:115`).
**Produces:** `findPlacesNearMe(props: ExecuteStepProps<FindPlacesNearMeStepSchema>): Promise<void>`

Order of checks: channel → sources (`findUpstreamLocationFieldKeys({ nodes: flowVersion.nodes, edges: flowVersion.edges, stepId: step.id })`) → `findContactLocation` → `findNearest({ categoryId: step.placeCategoryId, … })` → `sendFlowMessage({ ...props, commentAnchor: undefined, step: { id: step.id, nodeId: step.nodeId, stepType: stepTypes.enum.whatsappLocation, latitude, longitude, name } })`. Each failed check logs its reason and returns.

- [ ] **Step 1: Write the failing tests** (mock `@chatbotx.io/business` for `findContactLocation` / `placeLocationService`, and mock `sendFlowMessage`'s queue boundary — `enqueueFlowStepMessage`):
  - `skips non-WhatsApp contacts` (channel `"messenger"`) — no lookups, no enqueue
  - `skips when no upstream location source`
  - `skips when the contact has no valid location`
  - `skips when no place found`
  - `sends the nearest place as a WhatsApp location` — enqueued step equals `{ stepType: "whatsappLocation", latitude, longitude, name: "District 1 Store" }` with no `address` key; `findNearest` received `categoryId: null` for All
  - `does not forward the comment anchor`
- [ ] **Step 2:** `pnpm --filter worker test -- find-places-near-me` → FAIL.
- [ ] **Step 3:** Implement and register. Confirm `whatsappLocation` is accepted by `CHANNEL_DELIVERABLE_STEP_TYPES` in `apps/worker/src/chat/handlers/send-flow-step.ts` (it already is for the Location send step; add only if missing).
- [ ] **Step 4:** `pnpm --filter worker test -- find-places-near-me channel-policy-contract send-flow-step` → PASS; `pnpm --filter worker check-types` → pass.
- [ ] **Step 5: Commit** `feat(worker): handle findPlacesNearMe flow action`

### Task 5: Place category options for the flow editor (private oRPC)

**Files:**
- Create: `apps/builder/src/features/places-near-me/api/private.ts`, `apps/builder/src/features/places-near-me/api/index.ts`
- Modify: `apps/builder/src/routers/index.ts` (`placesNearMeAPI: lazy(() => import("@/features/places-near-me/api").then((m) => ({ default: m.placesNearMeAPI })))`)
- Create: `apps/builder/src/features/places-near-me/lib/use-place-category-options.ts`, `apps/builder/src/features/places-near-me/lib/use-invalidate-place-category-options.ts`
- Modify: `apps/builder/src/features/places-near-me/components/category-form-dialog.tsx`, `delete-category-dialog.tsx` (call the invalidator before `router.refresh()`)
- Test: `apps/builder/__tests__/places-near-me-category-options.test.ts`

**Interfaces — Produces:**
- `placesNearMeAPI.listPlaceCategoryOptionsAPI` — mirror `leaderboards/api/private.ts`: `GET /workspaces/{workspaceId}/places-near-me/category-options`, `authorizedAPI` + `workspaceAuthorizedMidddleware`, output `{ data: { id: string; name: string }[] }` from `placeCategoryService.list(workspaceId)` (already sorted rank, name).
- `usePlaceCategoryOptions(): { options: { label: string; value: string }[]; isLoading: boolean }` (mirror `use-leaderboard-options.ts`).
- `useInvalidatePlaceCategoryOptions(): () => Promise<void>` — invalidates `orpc.placesNearMeAPI.listPlaceCategoryOptionsAPI.key()`.

- [ ] **Step 1: Write the failing test**: calling the procedure handler with a mocked `placeCategoryService.list` returning two rows ⇒ `{ data: [{ id, name }, …] }` in the same order (follow an existing builder `__tests__` private-API test for the call harness).
- [ ] **Step 2:** `pnpm --filter builder test -- places-near-me-category-options` → FAIL.
- [ ] **Step 3:** Implement the procedure, router entry, both hooks, and the dialog invalidation.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5: Commit** `feat(places-near-me): category options for the flow editor`

### Task 6: Builder menu, editor and viewer

**Files:**
- Create: `apps/builder/src/features/flows/react-flow/steps/find-places-near-me/{index.tsx,editor.tsx,viewer.tsx}`
- Modify: `apps/builder/src/features/flows/react-flow/steps/index.tsx` (`[stepTypes.enum.findPlacesNearMe]: findPlacesNearMeStep`)
- Modify: `apps/builder/src/features/flows/react-flow/nodes/perform-action/menu.tsx` (new group after `triggers`, before `...buildProviderMenus(t)`)
- Modify: all `apps/builder/messages/*.json` (and regenerate/update `en.d.json.ts` the way the repo does)
- Test: `apps/builder/src/features/flows/react-flow/nodes/perform-action/__tests__/menu.test.ts`

**i18n keys (en)** under `flows.actions`: `moreOptions: "More options"`, `findPlacesNearMe: "Find places near me"`; under a new `flows.findPlacesNearMe`: `category: "Location category"`, `allLocations: "All locations"`, `whatsappOnly: "Only sent to WhatsApp contacts."`, `noLocationSource: "Add a Get User Data step with reply format Location before this action. Without it, this action is skipped."`. Translate for other locales.

**Interfaces — Consumes:** Task 1 schema/defaultFn/`findUpstreamLocationFieldKeys`; Task 5 `usePlaceCategoryOptions`.

- Menu: `{ label: t("flows.actions.moreOptions"), icon: EllipsisIcon, stepType: null, children: [{ label: t("flows.actions.findPlacesNearMe"), icon: MapPinIcon, stepType: stepTypes.enum.findPlacesNearMe }] }`.
- Editor: `BaseStepEditor` with `MapPinIcon` and title `t("flows.actions.findPlacesNearMe")`; a `SelectField` on `${parentName}.placeCategoryId` with options `[{ label: allLocations, value: ALL }, ...usePlaceCategoryOptions().options]`, mapping a sentinel `ALL = "__all__"` ↔ `null`; the WhatsApp-only note as muted text; the warning shown when `findUpstreamLocationFieldKeys({ nodes: useNodes(), edges: useEdges(), stepId })` is empty (`stepId` from `useWatch(`${parentName}.id`)`). A saved category id missing from options renders as an empty select.
- Viewer: `BaseStepViewer` with icon + `t("flows.actions.findPlacesNearMe")` only (mirror `generate-code/viewer.tsx`).

- [ ] **Step 1: Write the failing test** in `menu.test.ts`: `exposes Find places near me under More options` — the item labelled `flows.actions.moreOptions` has `stepType: null` and children containing `{ label: "flows.actions.findPlacesNearMe", stepType: stepTypes.enum.findPlacesNearMe }`.
- [ ] **Step 2:** `pnpm --filter builder test -- perform-action` → FAIL.
- [ ] **Step 3:** Implement menu, step definition, editor, viewer, i18n.
- [ ] **Step 4:** `pnpm --filter builder test -- perform-action` → PASS; `pnpm --filter builder i18n:check` → pass; `pnpm --filter builder check-types` → pass.
- [ ] **Step 5: Manual check** (`pnpm --filter builder dev`): add the action to a Perform Action node with no upstream location step → warning shows; connect a Send Message node with Get User Data (Location, contact field) upstream → warning disappears; card shows only "Find places near me"; category select lists categories + All locations; publish succeeds.
- [ ] **Step 6: Commit** `feat(flows): add More options › Find places near me action`

### Task 7: Final verification

- [ ] **Step 1:** `pnpm lint` → pass.
- [ ] **Step 2:** `pnpm --filter builder check-types && pnpm --filter worker check-types && pnpm --filter @chatbotx.io/flow-config check-types && pnpm --filter @chatbotx.io/business check-types && pnpm --filter @chatbotx.io/database check-types` → pass.
- [ ] **Step 3:** `pnpm test --filter @chatbotx.io/flow-config --filter @chatbotx.io/business --filter worker --filter builder` → pass.
- [ ] **Step 4:** Dispatch the `invariant-guard` agent on the branch diff; fix anything it reports.
- [ ] **Step 5:** End-to-end on a WhatsApp test number: flow = Get User Data (Location → contact field) → Perform Action (Find places near me, category X). Share a pin ⇒ receive the nearest category-X location pin with its name. Repeat from Messenger ⇒ nothing sent, flow continues.
