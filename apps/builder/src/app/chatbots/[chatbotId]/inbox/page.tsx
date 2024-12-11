import { Mail } from "@/components/mail/mail";
import { accounts, mails } from "@/components/mail/data";

export default function InboxPage({ children }: { children: React.ReactNode }) {
  return (
    <Mail
      accounts={accounts}
      mails={mails}
      defaultLayout={[20,32,48]}
      defaultCollapsed={false}
      navCollapsedSize={4}
    />
  )
}
