"use client"

import * as React from "react";
import { MailDisplay } from "@/components/mail/mail-display";
import { mails } from "@/components/mail/data";
import { useMail } from "@/components/mail/use-mail";

export default function ConversationPage() {

  const [mail] = useMail()

  return (
    <MailDisplay mail={mails[0]} />
  )
}
