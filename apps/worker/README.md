# Worker deployment

## Production topology

The container entrypoint accepts `worker <name>` for each built worker bundle;
for example, run `worker chat`, `worker integration`, or `worker heavy`. The
default `worker all` launches every worker under one supervisor, so one worker
crash stops every queue consumer in that container.

For production, deploy at least `chat`, `integration`, and `heavy` separately.
This contains an OOM or crash in one workload to its own deployment instead of
stopping the other queue consumers. Run `heavy` (long-running AI and image
jobs) with concurrency 1–3 so it cannot starve latency-sensitive chat and
integration processing.
