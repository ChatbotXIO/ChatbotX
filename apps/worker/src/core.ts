// Runs every core queue consumer in ONE Node process. Each `worker.ts` below
// starts itself on import and registers its closer with `lib/shutdown`, so a
// single SIGTERM drains them all.
//
// Separate processes cost ~270-400MB each (the shared business /
// integration graph is loaded once per process), so this is what `pnpm dev`
// and the `worker core` Docker command run. It trades CPU parallelism for
// memory. The image default, `worker standalone`, adds schedules and sequence
// workers; keep `worker all` / one `worker <name>` per container when a single
// queue needs its own core.
//
// Schedules and sequence workers stay out of `core.ts` so local development
// does not run cron or sequence sends against local data.
import "./ai-agent/worker"
import "./chat/worker"
import "./default/worker"
import "./events/worker"
import "./heavy/worker"
import "./integration/worker"
import "./low/worker"
import "./marketing-message/worker"
import "./notification/worker"
import "./trigger/worker"
import "./webhook/worker"
