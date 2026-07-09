import { describe, expect, test } from "vitest"
import {
  actionSteps,
  externalRequestStepDefaultFn,
  externalRequestStepSchema,
} from "../src"

describe("External request flow contract", () => {
  test("creates safe defaults with stable state ids", () => {
    const value = externalRequestStepDefaultFn()
    expect(value).toMatchObject({
      stepType: "callApi",
      method: "GET",
      url: "",
      headers: [],
      body: undefined,
    })
    expect(value.states.map((state) => state.stateType)).toEqual([
      "success",
      "error",
    ])
    expect(value.states.every((state) => Boolean(state.id))).toBe(true)
  })

  const validBase = () => ({
    ...externalRequestStepDefaultFn(),
    url: "https://api.example.com/endpoint",
    mapping: [{ jsonPath: "data.id", outputFieldId: "field-1" }],
  })

  test("GET without a body is valid", () => {
    expect(externalRequestStepSchema.safeParse(validBase()).success).toBe(true)
  })

  test("POST without a body is invalid", () => {
    const value = { ...validBase(), method: "POST" }
    expect(externalRequestStepSchema.safeParse(value).success).toBe(false)
  })

  test("POST with an empty jsonBody is invalid", () => {
    const value = {
      ...validBase(),
      method: "POST",
      body: { bodyType: "json", jsonBody: "" },
    }
    expect(externalRequestStepSchema.safeParse(value).success).toBe(false)
  })

  test("POST with a valid jsonBody is valid", () => {
    const value = {
      ...validBase(),
      method: "POST",
      body: { bodyType: "json", jsonBody: '{"foo":"bar"}' },
    }
    expect(externalRequestStepSchema.safeParse(value).success).toBe(true)
  })

  test("GET with a body is invalid", () => {
    const value = {
      ...validBase(),
      method: "GET",
      body: { bodyType: "allContactData" },
    }
    expect(externalRequestStepSchema.safeParse(value).success).toBe(false)
  })

  test("DELETE with a body is invalid", () => {
    const value = {
      ...validBase(),
      method: "DELETE",
      body: { bodyType: "json", jsonBody: '{"foo":"bar"}' },
    }
    expect(externalRequestStepSchema.safeParse(value).success).toBe(false)
  })

  test("rejects duplicate header keys, case-insensitively", () => {
    const value = {
      ...validBase(),
      headers: [
        { key: "Authorization", value: "a" },
        { key: "authorization", value: "b" },
      ],
    }
    expect(externalRequestStepSchema.safeParse(value).success).toBe(false)
  })

  test("rejects duplicate formEncoded field keys", () => {
    const value = {
      ...validBase(),
      method: "POST",
      body: {
        bodyType: "formEncoded",
        formFields: [
          { key: "name", value: "a" },
          { key: "name", value: "b" },
        ],
      },
    }
    expect(externalRequestStepSchema.safeParse(value).success).toBe(false)
  })

  test("is registered in the shared action union", () => {
    const value = validBase()
    expect(actionSteps.some((schema) => schema.safeParse(value).success)).toBe(
      true,
    )
  })
})
