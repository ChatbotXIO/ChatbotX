// @vitest-environment jsdom

import type React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest"
import { NavUser } from "../nav-user"

const isCloud: Mock<() => boolean> = vi.fn(() => false)

vi.mock("@/env", () => ({
  isCloud: () => isCloud(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    key === "actions.manage" ? "Manage" : key,
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

vi.mock("@chatbotx.io/ui/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  AvatarImage: () => null,
}))

vi.mock("@chatbotx.io/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    render,
  }: {
    children?: React.ReactNode
    render?: React.ReactNode
  }) => <div>{render ?? children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ render }: { render: React.ReactNode }) => (
    <>{render}</>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/sidebar", () => ({
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenuButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useSidebar: () => ({ isMobile: false }),
}))

vi.mock("@/enterprise/features/billing/upgrade-plan-dialog", () => ({
  UpgradePlanDialog: () => null,
}))

vi.mock("@/features/auth/sign-out", () => ({
  SignOut: () => null,
}))

vi.mock("@/features/workspaces/components/edit-profile-dialog", () => ({
  EditProfileDialog: () => null,
}))

vi.mock(
  "@/features/workspaces/components/refresh-all-channel-tokens-button",
  () => ({
    RefreshAllChannelTokensButton: () => null,
  }),
)

vi.mock("@/lib/auth/avatar", () => ({
  useUserAvatarUrl: (avatar: string) => avatar,
}))

vi.mock("../lang-selector", () => ({
  LangSelector: () => null,
}))

vi.mock("../theme-switcher", () => ({
  ThemeSwitcher: () => null,
}))

const USER = {
  name: "Jane Doe",
  email: "jane@example.test",
  avatar: "",
}

describe("NavUser", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    isCloud.mockReset()
    isCloud.mockReturnValue(false)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (
    props: { canAccessManage?: boolean; cloud?: boolean } = {},
  ) => {
    isCloud.mockReturnValue(props.cloud ?? false)
    act(() => {
      root.render(
        <NavUser canAccessManage={props.canAccessManage} user={USER} />,
      )
    })
  }

  const findManageLink = () =>
    Array.from(container.querySelectorAll("a")).find(
      (link) => link.getAttribute("href") === "/manage",
    )

  it("renders Manage on cloud when the user can access credentials", () => {
    render({ canAccessManage: true, cloud: true })

    expect(findManageLink()?.textContent).toContain("Manage")
  })

  it("hides Manage on cloud without credential access", () => {
    render({ cloud: true })

    expect(findManageLink()).toBeUndefined()
  })

  it("hides Manage on community edition with credential access", () => {
    render({ canAccessManage: true, cloud: false })

    expect(findManageLink()).toBeUndefined()
  })
})
