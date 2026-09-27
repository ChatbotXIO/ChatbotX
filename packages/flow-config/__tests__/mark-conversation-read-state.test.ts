import { describe, expect, test } from "vitest"
import {
  actionSteps,
  markConversationAsReadStepDefaultFn,
  markConversationAsReadStepSchema,
  markConversationAsUnreadStepDefaultFn,
  markConversationAsUnreadStepSchema,
  stepTypes,
} from "../src"

describe("mark conversation read/unread step contracts", () => {
  test("defaults carry the right stepType and an id", () => {
    const read = markConversationAsReadStepDefaultFn()
    const unread = markConversationAsUnreadStepDefaultFn()

    expect(read.stepType).toBe(stepTypes.enum.markConversationAsRead)
    expect(unread.stepType).toBe(stepTypes.enum.markConversationAsUnread)
    expect(read.id).toBeTruthy()
    expect(unread.id).toBeTruthy()
  })

  test("schemas round-trip their defaults and reject the other type", () => {
    const read = markConversationAsReadStepDefaultFn()
    const unread = markConversationAsUnreadStepDefaultFn()

    expect(markConversationAsReadStepSchema.parse(read)).toEqual(read)
    expect(markConversationAsUnreadStepSchema.parse(unread)).toEqual(unread)
    expect(() => markConversationAsReadStepSchema.parse(unread)).toThrow()
  })

  test("both are registered as action steps", () => {
    for (const stepType of [
      stepTypes.enum.markConversationAsRead,
      stepTypes.enum.markConversationAsUnread,
    ]) {
      expect(
        actionSteps.some(
          (schema) => schema.safeParse({ id: "1", stepType }).success,
        ),
      ).toBe(true)
    }
  })
})
