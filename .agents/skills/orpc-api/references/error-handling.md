# Error handling and declared errors

## Error Handling

Throw `ChatbotXException` (`@chatbotx.io/business/errors`) or `ModelNotfoundException` (`@chatbotx.io/database/errors`) — they are auto-mapped to oRPC errors by `mapKnownOrpcErrors` (`apps/builder/src/orpc.ts`), the middleware-level `onError` interceptor shared by all three auth stacks: it warn-logs and remaps known errors, leaving anything else untouched. Unknown errors are logged exactly once at error level by `logUnexpectedOrpcErrorCallback` (`apps/builder/src/lib/orpc/handlers.ts`), the route-level interceptor used by the `/api` and `/rpc` handlers:

```typescript
import { ChatbotXException, notFoundException } from "@chatbotx.io/business/errors"

throw notFoundException("Item not found")
throw new ChatbotXException("Custom error", "BAD_REQUEST", 400)
```

### Declared errors (`.errors()`) — public routes only

Every public procedure must declare the errors it can throw, because that
declaration is what renders the non-2xx responses in the OpenAPI spec (and
what the MCP server and CLI show a caller). The declaration is split in two:

| Layer | Where | Contains |
|-------|-------|----------|
| Shared | `commonApiErrors`, attached **once** to the public stacks in `@/orpc` | 401 (`UNAUTHORIZED`, `INVALID_CHATBOT_TOKEN`), 403 (`FORBIDDEN`, `trialExpired`, `macLimitReached`), 422 (`invalidRequestData`, `validation`), 429 (`tooManyRequests`), 500 (`INTERNAL_SERVER_ERROR`) |
| Per-route | one `possibleErrorsOn*Resource` set from `@/lib/orpc/orpc-error-helper` | only what varies by operation shape — `notFound` (404) and `businessError` (400) |

Pick the per-route set by what the handler can actually fail with, not by the
HTTP verb:

- `possibleErrorsOnListingResource` — a collection read that cannot 404.
- `possibleErrorsOnFindingResource` — a read that resolves one resource.
- `possibleErrorsOnCreatingResource` — a create with no parent lookup.
- `possibleErrorsOnMutatingResource` — an update, **or a create that resolves a
  parent from a path param** (e.g. `POST /v1/contacts/{identifier}/notes` calls
  `contactService.resolveIdByIdentifier`, which throws 404).
- `possibleErrorsOnDeletingResource` — a delete.

**Never re-declare a `commonApiErrors` code in a per-route set.** Doing so
duplicates the entry in the generated spec. The guard in
`apps/builder/__tests__/public-spec-operations.test.ts` fails on both mistakes:
a route missing a universal code, and a duplicated one.

**The `code` string is the contract, not the status.** oRPC matches a thrown
`ORPCError` to its declaration by `code` *and* exact `status`
(`validateORPCError` in `@orpc/contract`). On a miss it does not error — it
returns the error with `defined: false`, so an undeclared code still reaches
the client but never appears in the spec. That silent degrade is why a new
`ChatbotXException` code thrown from a public route needs a matching entry in
one of these sets.
