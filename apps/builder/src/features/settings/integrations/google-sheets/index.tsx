import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { T } from "@tolgee/react"
import Link from "next/link"
import { useState } from "react"

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
]

export const SettingIntegrationGoogleSheets = () => {
  const [isConnect, setIsConnect] = useState(false)

  const onConnect = () => {
    // TODO: Call API connect google sheets
    setIsConnect(true)
  }

  return (
    <Card className="rounded-lg mb-4">
      <CardContent className="p-4 flex items-center justify-between">
        <CardHeader className="p-2">
          <CardTitle>
            <T keyName="settings.integrations.GoogleSheets.title" />
          </CardTitle>

          <CardDescription>
            <T keyName="settings.integrations.GoogleSheets.Descriptions" />
            <Link href="/docs" className="text-blue-500 pl-1">
              Learn More
            </Link>
          </CardDescription>
        </CardHeader>

        <div className={cn(isConnect ? "flex flex-col gap-2" : "")}>
          {isConnect ? (
            <>
              <Button variant="secondary">
                <T keyName="settings.integrations.Button.Manager" />
              </Button>

              <Button variant="destructive">
                <T keyName="settings.integrations.Button.Disconnect" />
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={onConnect}>
              <T keyName="settings.integrations.Button.Connect" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
