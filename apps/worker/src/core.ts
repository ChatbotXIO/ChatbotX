// Runs every core queue consumer in ONE Node process. Each `worker.ts` below
// starts itself on import and registers its closer with `lib/shutdown`, so a
// single SIGTERM drains them all.
//
// Separate processes cost ~270-400MB each (the shared business /
// integration graph is loaded once per process), so this is what `pnpm dev`
// and the `worker core` Docker command run. It trades CPU parallelism for
// memory. The image default, `worker standalone`, adds schedule on top; keep
// `worker all` / one `worker <name>` per container when a single
// queue needs its own core.
//
// Schedule (cron) and the sequence-scheduler (Kafka) workers are deliberately
// absent — they drive production-like workloads and run as their own processes.
import "./ai-agent/worker"
import "./chat/worker"
import "./default/worker"
import "./events/worker"
import "./heavy/worker"
import "./integration/worker"
import "./low/worker"
import "./notification/worker"
import "./trigger/worker"
import "./webhook/worker"
