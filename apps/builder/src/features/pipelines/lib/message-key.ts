import type { useTranslations } from "next-intl"

/** A key of the `pipelines` message namespace, as `t()` accepts it. */
export type PipelineMessageKey = Parameters<
  ReturnType<typeof useTranslations<"pipelines">>
>[0]
