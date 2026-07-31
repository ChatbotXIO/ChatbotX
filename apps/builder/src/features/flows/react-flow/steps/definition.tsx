import type { JSX } from "react"
import type z from "zod"
import type { ZodTypeAny } from "zod"
import type { StepValidator } from "./channel-validator"

type StepEditorProps = {
  parentName: string
}

export type StepDefinition<T extends z.infer<ZodTypeAny>> = {
  editor: (props: StepEditorProps) => JSX.Element
  // biome-ignore lint/suspicious/noExplicitAny: wip
  viewer: (props: any) => JSX.Element
  /**
   * One schema when the step validates identically everywhere, or a per-channel
   * map when a channel restricts it (see `channel-validator.ts`). A channel-aware
   * step must declare its map in a React-free `validator.ts` so the publish
   * schema can import it without dragging the editor into the server bundle.
   */
  validator: StepValidator
  defaultFn: (props?: Partial<T>) => T
}
