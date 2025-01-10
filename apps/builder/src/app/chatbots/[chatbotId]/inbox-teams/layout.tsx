import { ReactNode } from "react";

export default function InboxTeamsLayout({ children, teams }: { children: ReactNode, teams: ReactNode }) {
  return (
    <>
      {teams}
      {children}
    </>
  )
}
