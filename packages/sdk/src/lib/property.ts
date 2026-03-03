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
  shortText: (props: PropertyProps) => {
    return {
      ...props,
      type: propertyTypes.shortText,
    }
  },
  longtText: (props: PropertyProps) => {
    return {
      ...props,
      type: propertyTypes.text,
    }
  },
  number: (props: PropertyProps) => {
    return {
      ...props,
      type: propertyTypes.number,
    }
  },
  boolean: (props: PropertyProps) => {
    return {
      ...props,
      type: propertyTypes.boolean,
    }
  },
  date: (props: PropertyProps) => {
    return {
      ...props,
      type: propertyTypes.date,
    }
  },
  datetime: (props: PropertyProps) => {
    return {
      ...props,
      type: propertyTypes.datetime,
    }
  },
  staticDropdown: (props: HasOptionPropertyProps) => {
    return {
      ...props,
      type: propertyTypes.staticDropdown,
    }
  },
  dynamicDropdown: (props: HasOptionPropertyProps) => {
    return {
      ...props,
      type: propertyTypes.dynamicDropdown,
    }
  },
  array: (props: HasOptionPropertyProps) => {
    return {
      ...props,
      type: propertyTypes.array,
    }
  },
  object: (props: HasOptionPropertyProps) => {
    return {
      ...props,
      type: propertyTypes.object,
    }
  },
  file: (props: PropertyProps) => {
    return {
      ...props,
      type: propertyTypes.file,
    }
  },
}
