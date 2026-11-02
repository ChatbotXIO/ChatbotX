import { describe, expect, test } from "vitest"
import {
  evaluateMathExpression,
  MATH_EXPRESSION_LIMITS,
} from "../src/field-value-calculator/math-expression"

const ones = (count: number): string[] =>
  Array.from({ length: count }, () => "1")
const variables = new Map([["value", 10]])
const run = (source: string) => evaluateMathExpression(source, variables)
const numberOf = (source: string) => {
  const result = run(source)
  return result.ok ? result.value : null
}

describe("evaluateMathExpression", () => {
  test.each([
    ["1 + 2 * 3", 7],
    ["(1 + 2) * 3", 9],
    ["10 - 4 - 3", 3],
    ["2 * 3 % 4", 2],
    ["-3 + 5", 2],
    ["--3", 3],
    ["+4", 4],
    ["-(2 + 3)", -5],
    ["1e2 + .5", 100.5],
    ["VALUE * 2", 20],
    ["value / 4", 2.5],
    ["pi", Math.PI],
    ["e", Math.E],
    ["2e3", 2000],
  ])("%s = %s", (source, expected) => {
    expect(numberOf(source)).toBe(expected)
  })

  test.each([
    ["abs(-3)", 3],
    ["ceil(1.2)", 2],
    ["floor(1.8)", 1],
    ["round(2.5)", 3],
    ["min(3, 1, 2)", 1],
    ["max(3, 1, 2)", 3],
    ["pow(2, 10)", 1024],
    ["sqrt(81)", 9],
    ["logTen(1000)", 3],
    ["hypot(3, 4)", 5],
    ["fMod(7, 4)", 3],
    ["round(value / 3)", 3],
    ["max(1, abs(-5) + 1)", 6],
  ])("%s = %s", (source, expected) => {
    expect(numberOf(source)).toBeCloseTo(expected, 10)
  })

  test.each([
    "",
    "   ",
    "1 +",
    "(1 + 2",
    "1 2",
    "foo",
    "foo(1)",
    "abs()",
    "abs(1, 2)",
    "pow(1)",
    "1 / 0",
    "5 % 0",
    "1e309",
    "pow(10, 400)",
    "sqrt(-1)",
    "1 $ 2",
    "constructor",
    "__proto__",
    "toString(1)",
    "value.x",
    "2 e",
  ])("rejects %j without throwing", (source) => {
    expect(run(source)).toEqual({ ok: false })
  })

  test("enforces its limits", () => {
    expect(run("1".repeat(MATH_EXPRESSION_LIMITS.maxLength + 1))).toEqual({
      ok: false,
    })
    expect(run(ones(MATH_EXPRESSION_LIMITS.maxTokens).join("+"))).toEqual({
      ok: false,
    })
    expect(run(`${"(".repeat(40)}1${")".repeat(40)}`)).toEqual({ ok: false })
    expect(run(`${"-".repeat(40)}1`)).toEqual({ ok: false })
    expect(
      run(`max(${ones(MATH_EXPRESSION_LIMITS.maxArguments + 1).join(",")})`),
    ).toEqual({ ok: false })
  })

  test("accepts the maximum number of arguments", () => {
    expect(
      numberOf(`max(${ones(MATH_EXPRESSION_LIMITS.maxArguments).join(",")})`),
    ).toBe(1)
  })

  test("never throws on arbitrary input", () => {
    const alphabet = "0123456789+-*/%(),. eEvalupitnsqrtabcm_$\n\t"
    let seed = 42
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed
    }
    for (let round = 0; round < 3000; round += 1) {
      const length = next() % 40
      const source = Array.from(
        { length },
        () => alphabet[next() % alphabet.length],
      ).join("")
      expect(() => run(source)).not.toThrow()
    }
  })
})

describe("every registered function", () => {
  test.each([
    ["exp(0)", 1],
    ["sin(0)", 0],
    ["cos(0)", 1],
    ["tan(0)", 0],
    ["asin(0)", 0],
    ["acos(1)", 0],
    ["atan(0)", 0],
  ])("%s = %s", (source, expected) => {
    expect(numberOf(source)).toBe(expected)
  })

  test("log(e) is 1", () => {
    expect(numberOf("log(e)")).toBeCloseTo(1, 10)
  })

  test.each(["log(0)", "asin(2)", "acos(2)"])("%s is rejected", (source) => {
    expect(run(source).ok).toBe(false)
  })
})
