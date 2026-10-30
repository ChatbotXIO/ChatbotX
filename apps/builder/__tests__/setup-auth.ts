import { vi } from "vitest"

vi.mock("@/lib/auth/auth", () => ({ auth: {} }))
