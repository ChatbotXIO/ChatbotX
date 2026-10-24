// @vitest-environment node

import { type AbstractIntlMessages, NextIntlClientProvider } from "next-intl"
import { renderToStaticMarkup } from "react-dom/server"
import type { FieldValues, Resolver, ResolverOptions } from "react-hook-form"
import { describe, expect, test } from "vitest"
import { z } from "zod"
import {
  type FieldRule,
  useRequestResolver,
} from "@/lib/validation/use-request-resolver"
import en from "../messages/en.json"
import vi from "../messages/vi.json"

type Values = { code: string; amount: string; range: { from: string } }

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,64}$/),
  amount: z.number().int().min(1),
  ranges: z.array(z.object({ from: z.string().min(1) })),
})

const toRequest = (values: Values) => ({
  code: values.code,
  amount: Number(values.amount),
  ranges: [{ from: values.range.from }],
})

const resolverOptions = {
  fields: {},
  shouldUseNativeValidation: false,
} as ResolverOptions<Values>

/** Builds the resolver inside a render, where its hooks can run. */
const buildResolver = (
  messages: AbstractIntlMessages,
  rules?: (values: Values) => Array<FieldRule<Values> | false>,
) => {
  let resolver: Resolver<Values> | undefined
  function Capture() {
    resolver = useRequestResolver<Values>({
      schema,
      toRequest,
      rules,
      fieldFor: (path) =>
        path.startsWith("ranges.") ? "range.from" : path.split(".")[0],
    })
    return null
  }
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Capture />
    </NextIntlClientProvider>,
  )
  if (!resolver) {
    throw new Error("The resolver was not built")
  }
  return resolver
}

const messagesOf = async (
  resolver: Resolver<Values>,
  values: Values,
): Promise<FieldValues> => {
  const { errors } = await resolver(values, undefined, resolverOptions)
  return JSON.parse(
    JSON.stringify(errors, (key, value) => (key === "ref" ? undefined : value)),
  )
}

describe("useRequestResolver", () => {
  test("passes a valid form through unchanged", async () => {
    const values = { code: "SALE10", amount: "2", range: { from: "09:00" } }
    const result = await buildResolver(en)(values, undefined, resolverOptions)
    expect(result).toEqual({ values, errors: {} })
  })

  test("puts each problem, in plain words, on its form field", async () => {
    const errors = await messagesOf(buildResolver(en), {
      code: "ab",
      amount: "1.5",
      range: { from: "" },
    })
    expect(errors).toEqual({
      code: {
        type: "validation",
        message: "This value is not in the right format.",
      },
      amount: { type: "validation", message: "Enter a whole number." },
      range: {
        from: { type: "validation", message: "This field is required." },
      },
    })
  })

  test("a rule wins over the schema's sentence for the same field", async () => {
    const resolver = buildResolver(vi, (values) => [
      values.code.trim().length < 3 && {
        field: "code",
        message: "Nhập ít nhất 3 ký tự.",
      },
    ])
    const errors = await messagesOf(resolver, {
      code: "ab",
      amount: "0",
      range: { from: "09:00" },
    })
    expect(errors).toEqual({
      code: { type: "validation", message: "Nhập ít nhất 3 ký tự." },
      amount: { type: "validation", message: "Nhập số từ 1 trở lên." },
    })
  })
})
