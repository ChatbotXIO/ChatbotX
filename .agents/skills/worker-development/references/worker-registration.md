# Creating a New Worker

**Copy `apps/worker/src/notification/worker.ts`** — it is the smallest complete example and
already shows the shape you need: a `start` function that calls
`createQueueWorker(queueNames.enum.<queue>, processor, { concurrency: env.<X>_WORKER_CONCURRENCY,
onFailed? })` with a `withBlockedOwnerGuard(workspaceId, …)`-wrapped processor, then
`runWorker("<name>", start)` at module bottom. `createQueueWorker`
(`apps/worker/src/lib/create-queue-worker.ts`) supplies the connection, `defaultWorkerOptions`, the
`error`/`failed` listeners and shutdown draining — do not hand-roll `new Worker(…)`,
`ensureBootstrapped()` or `failed` listeners. `runWorker` (`apps/worker/src/lib/shutdown.ts`)
bootstraps and routes start failures into the shared shutdown.

Create `apps/worker/src/<domain>/worker.ts` from it and change four things:

1. The queue: `queueNames.enum.myQueue`.
2. The job type: `Job<MyQueueJobData>`.
3. The processor body — `switch (job.data.type)` over your `MyQueueJobAction` members, with a
   `default: return` so an unknown action is a no-op rather than a throw.
4. The concurrency env var, if the workload needs one.

**Do not drop `withBlockedOwnerGuard`.** Every workspace-scoped processor must wrap its body in
it (repo invariant 15) — a template without it is the single most common mistake here. See
"Blocked-owner guard" below for which jobs are exempt.

### Register the Worker (three places)

A worker that is not imported by an entry point never runs under the image default
`worker standalone`. Do all three:

1. Import it in `apps/worker/src/core.ts` (or `apps/worker/src/standalone.ts` for cron/sequence-like workers).
2. Add the tsdown entry below.
3. Add it to the existing-workers table in this skill.

#### tsdown entry

Add to `apps/worker/tsdown.config.ts`:

```typescript
entry: [
  // ...existing
  "src/<domain>/worker.ts",
]
```

### Add Dev Script

Add to `apps/worker/package.json`:

```json
{
  "scripts": {
    "worker:<domain>": "dotenv -e ../../.env -- tsx --watch src/<domain>/worker.ts"
  }
}
```

Include in the `dev` script's concurrently list if needed.
