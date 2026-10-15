// biome-ignore-all lint/suspicious/noThenProperty: `then` is the Flow JSON If branch key
import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  canPlaceInSlot,
  defaultSlotsFor,
  MINI_APP_COMPONENT_LIST,
  MINI_APP_COMPONENTS,
} from "../src/components"
import { createNode } from "../src/tree"
import { miniAppComponentTypes } from "../src/types"

const COMPONENT_TYPES = miniAppComponentTypes.options

/**
 * If/Switch start with an empty expression, and NavigationList items with no
 * action — the author must fill these in.
 */
const STARTS_INCOMPLETE = new Set(["If", "Switch", "NavigationList"])

describe("component catalog", () => {
  it("defines every component type exactly once", () => {
    expect(MINI_APP_COMPONENT_LIST.map((component) => component.type)).toEqual(
      COMPONENT_TYPES,
    )
  })

  it("keeps each component's settings", () => {
    expect(
      MINI_APP_COMPONENT_LIST.map(
        ({ defaultProps, propsSchema: _propsSchema, ...settings }) => ({
          ...settings,
          defaultProps: defaultProps((key) => key),
        }),
      ),
    ).toMatchSnapshot()
  })

  it("keeps each component's props schema", () => {
    expect(
      Object.fromEntries(
        MINI_APP_COMPONENT_LIST.map(({ type, propsSchema }) => [
          type,
          z.toJSONSchema(propsSchema, { unrepresentable: "any" }),
        ]),
      ),
    ).toMatchSnapshot()
  })

  it.each(
    COMPONENT_TYPES.filter((type) => !STARTS_INCOMPLETE.has(type)),
  )("creates a %s whose props pass its own schema", (type) => {
    const node = createNode(type, new Set())
    expect(MINI_APP_COMPONENTS[type].propsSchema.safeParse(node.props)).toEqual(
      expect.objectContaining({ success: true }),
    )
  })

  it("gives containers their default slots", () => {
    expect(defaultSlotsFor("Form")).toEqual({ children: [] })
    expect(defaultSlotsFor("If")).toEqual({ then: [], else: [] })
    expect(defaultSlotsFor("Switch")).toEqual({ case_1: [] })
    expect(defaultSlotsFor("TextBody")).toBeUndefined()
  })

  it("keeps which component may be placed in which container", () => {
    const matrix = Object.fromEntries(
      (["Screen", "Form", "If", "Switch", "TextBody"] as const).map(
        (parent) => [
          parent,
          COMPONENT_TYPES.filter((child) => canPlaceInSlot(parent, child)),
        ],
      ),
    )
    expect(matrix).toMatchSnapshot()
  })
})
