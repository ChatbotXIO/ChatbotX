import type { ReactNode } from "react"

type LayoutProps = {
  children: ReactNode
}

// export layout without parent layout
export default function MessengerLayout({ children }: LayoutProps) {
  return <div>{children}</div>
}
