import { expect } from "vitest"

export const expectStateVerbatim = (
  url: string | undefined,
  expectedState: string,
) => {
  expect(url).toBeDefined()
  expect(new URL(url as string).searchParams.get("state")).toBe(expectedState)
}
