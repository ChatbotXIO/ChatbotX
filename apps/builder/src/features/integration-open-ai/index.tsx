import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { T } from "@/tolgee/server"
import Link from "next/link"
import { SettingIntegrationOpenAIDialogDisconnect } from "./components/dialog-disconnect"
import { SettingIntegrationOpenAIDialogEdit } from "./components/dialog-edit"

export const SettingIntegrationOpenAI = () => {
  const isConnect = true
  // const [isConnect, setIsConnect] = useState(false)

  const renderButtonConnect = () => {
    return (
      <>
        <SettingIntegrationOpenAIDialogEdit />
        <SettingIntegrationOpenAIDialogDisconnect />
      </>
    )
  }

  return (
    <>
      ok
      <Card className="rounded-lg mb-4">
        <CardContent className="p-4 flex items-center justify-between">
          <CardHeader className="p-2">
            <CardTitle>
              <T keyName="settings.integrations.OpenAI.title" />
            </CardTitle>

            <CardDescription>
              <T keyName="settings.integrations.OpenAI.Descriptions" />
              <Link href="/docs" className="text-blue-500 pl-1">
                Learn More
              </Link>
            </CardDescription>
          </CardHeader>

          <div className={cn(isConnect ? "flex flex-col gap-2" : "")}>
            {
              isConnect ? renderButtonConnect() : "heheh"
              // <SettingIntegrationOpenAIDialogConnect />
            }
          </div>
        </CardContent>
      </Card>
      {/* {isConnect && (
        <>
          <Card className="rounded-lg mb-4">
            <CardContent className="p-4 flex items-center justify-between">
              <CardHeader className="p-2">
                <CardTitle>
                  <T keyName="settings.integrations.OpenAI.AutomatedResponses.title" />
                </CardTitle>

                <CardDescription>
                  <T keyName="settings.integrations.OpenAI.AutomatedResponses.Descriptions" />
                </CardDescription>
              </CardHeader>

              <div className="">
                <Switch />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg mb-4">
            <CardContent className="p-4 flex items-center justify-between">
              <CardHeader className="p-2">
                <CardTitle>
                  <T keyName="settings.integrations.OpenAI.AutomaticVoice.title" />
                </CardTitle>

                <CardDescription>
                  <T keyName="settings.integrations.OpenAI.AutomaticVoice.Descriptions" />
                </CardDescription>
              </CardHeader>

              <div className="">
                <Switch />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg mb-4">
            <CardContent className="p-4 flex items-center justify-between">
              <CardHeader className="p-2">
                <CardTitle>
                  <T keyName="settings.integrations.OpenAI.Agents.title" />
                </CardTitle>

                <CardDescription>
                  <T keyName="settings.integrations.OpenAI.Agents.Descriptions" />
                </CardDescription>
              </CardHeader>

              <div className="">
                <Button variant="secondary" className="w-[250px]">
                  Manage
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg mb-4">
            <CardContent className="p-4 flex items-center justify-between">
              <CardHeader className="p-2">
                <CardTitle>
                  <T keyName="settings.integrations.OpenAI.Assistants.title" />
                </CardTitle>

                <CardDescription>
                  <T keyName="settings.integrations.OpenAI.Assistants.Descriptions" />
                </CardDescription>
              </CardHeader>

              <div className="">
                <Button variant="secondary" className="w-[250px]">
                  Manage
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardContent className="p-4 flex items-center justify-between">
              <CardHeader className="p-2">
                <CardTitle>
                  <T keyName="settings.integrations.OpenAI.AITriggers.title" />
                </CardTitle>

                <CardDescription>
                  <T keyName="settings.integrations.OpenAI.AITriggers.Descriptions" />
                  <Link href="/docs" className="text-blue-500 pl-1">
                    Learn More
                  </Link>
                </CardDescription>
              </CardHeader>

              <div className="">
                <Button variant="secondary" className="w-[250px]">
                  Manage
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )} */}
    </>
  )
}
