import type { z } from "zod"

export const propertyTypes = {
  shortText: "shortText",
  staticDropdown: "staticDropdown",
  number: "number",
  boolean: "boolean",
  date: "date",
  datetime: "datetime",
  array: "array",
  object: "object",
  image: "image",
  file: "file",
  email: "email",
  phone: "phone",
  text: "text",
  dynamicDropdown: "dynamicDropdown",
  checkbox: "checkbox",
  multiSelect: "multiSelect",
  fromCustomFieldToData: "fromCustomFieldToData",
  fromDataToCustomField: "fromDataToCustomField",
} as const

export type PropertyProps = {
  name: string
  label?: string
  schema: z.ZodSchema
  description?: string
}

export type HasOptionPropertyProps = PropertyProps & {
  options: []
  refreshers?: string[]
}

export const properties = {
  shortText: (props: PropertyProps) => ({
    ...props,
    type: propertyTypes.shortText,
  }),
  longtText: (props: PropertyProps) => ({
    ...props,
    type: propertyTypes.text,
  }),
  number: (props: PropertyProps) => ({
    ...props,
    type: propertyTypes.number,
  }),
  boolean: (props: PropertyProps) => ({
    ...props,
    type: propertyTypes.boolean,
  }),
  date: (props: PropertyProps) => ({
    ...props,
    type: propertyTypes.date,
  }),
  datetime: (props: PropertyProps) => ({
    ...props,
    type: propertyTypes.datetime,
  }),
  staticDropdown: (props: HasOptionPropertyProps) => ({
    ...props,
    type: propertyTypes.staticDropdown,
  }),
  dynamicDropdown: (props: HasOptionPropertyProps) => ({
    ...props,
    type: propertyTypes.dynamicDropdown,
  }),
  array: (props: HasOptionPropertyProps) => ({
    ...props,
    type: propertyTypes.array,
  }),
  object: (props: HasOptionPropertyProps) => ({
    ...props,
    type: propertyTypes.object,
  }),
  file: (props: PropertyProps) => ({
    ...props,
    type: propertyTypes.file,
  }),
}
