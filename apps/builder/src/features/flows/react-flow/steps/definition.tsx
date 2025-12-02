import type { JSX } from "react"
import type z from "zod"
import type { ZodTypeAny } from "zod"

type StepEditorProps = {
  parentName: string
}

export type StepDefinition<T extends z.infer<ZodTypeAny>> = {
  editor: (props: StepEditorProps) => JSX.Element
  // biome-ignore lint/suspicious/noExplicitAny: wip
  viewer: (props: any) => JSX.Element
  validator: ZodTypeAny
  defaultFn: (props?: Partial<T>) => T
}
