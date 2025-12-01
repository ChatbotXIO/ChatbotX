import type { JSX } from "react"
import type z from "zod"
import type { ZodTypeAny } from "zod"
import type { FlowVersionResource } from "@/features/flows/schemas/get-flows-schema"

type StepEditorProps = {
  parentName: string
  flowVersion: FlowVersionResource
}

export type StepDefinition<T extends z.infer<ZodTypeAny>> = {
  editor: (props: StepEditorProps) => JSX.Element
  // biome-ignore lint/suspicious/noExplicitAny: wip
  viewer: (props: any) => JSX.Element
  validator: ZodTypeAny
  defaultFn: (props?: Partial<T>) => T
}
