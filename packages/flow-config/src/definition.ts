import type { JSX } from "react"

export type StepDefinitionProps = {
  parentName: string
}

export type StepDefinition<ValidationT> = {
  editor: (props: StepDefinitionProps) => JSX.Element
  viewer: (props: StepDefinitionProps) => JSX.Element
  validator: ValidationT
  defaultFn: (props: ValidationT) => ValidationT
}
