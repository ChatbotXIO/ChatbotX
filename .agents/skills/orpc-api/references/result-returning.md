# Result-returning operations: reference implementation

`botSimulator.getLink` (`features/bot-simulator/api/public.ts`) is the reference:

```typescript
const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

export const botSimulatorPublicRouter = {
  getLink: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/bot-simulator/link",
      summary: "Get bot simulator link",
      description:
        "Returns a shareable link that opens the given website with a webchat widget on top, to preview the bot on a real page. The webchat must be enabled and the website on its allowed domains. Get webchat ids from `webchats.list`.",
      tags: ["Bot Simulator"],
    })
    .input(z.object({ webchatId: zodBigintAsString().describe("… Get it from `webchats.list`."), websiteUrl: … }))
    .output(z.object({ url: z.string().describe("Bot simulator link; anyone with it can open the preview.") }))
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => ({
      url: await createBotSimulatorLink({ workspaceId: context.workspace.id, ...input }),
    })),
}
```

What to copy from it:

- **Return data, not a screen.** The UI shows a preview; the API returns the `url`.
  Results are ids, URLs, or JSON an agent can act on — never HTML meant for display.
- **One implementation.** The handler calls `createBotSimulatorLink` in the feature's
  `lib/` (or a service method when it touches the DB); the UI path calls the same
  function. Never re-derive the result inside the handler.
- **Point at the source of every input id** in `description`/`.describe()`
  ("Get webchat ids from `webchats.list`") so an agent can chain calls without guessing.
- **Key = verb + noun**: `getLink`, `preview`, `testSend`, `run`, `export`, `getStats`,
  `generate`, `sync` (see "Public procedures" below for the naming rules).
- **Pick the method by side effect.** `GET` when it only reads or computes (link,
  preview, stats). `POST` when it sends something real, runs automation, calls a paid
  AI model, or spends quota — `read_only` tokens are limited to GET/HEAD, and a test
  send must not slip through one.
- **Set MCP hints when the method misleads.** A `POST` preview/generate with no side
  effect gets `mcpSpec({ readOnlyHint: true })`; a `GET` that is not safe to repeat
  is a design smell — make it `POST`.
