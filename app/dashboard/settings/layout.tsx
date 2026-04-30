"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconSettings, IconWebhook, IconPlug, IconClock } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

const settingsTabs = [
  { label: "Integração", href: "/dashboard/settings/integration", icon: IconPlug },
  { label: "Webhooks", href: "/dashboard/settings/webhooks", icon: IconWebhook },
  { label: "Scheduler", href: "/dashboard/settings/scheduler", icon: IconClock },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6 animate-slide-up">
      <div className="flex items-center gap-2">
        <IconSettings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
      </div>

      <div className="flex gap-1 border-b border-border">
        {settingsTabs.map((tab) => {
          const isActive = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Link>
          )
        })}
      </div>

      <div>{children}</div>
    </div>
  )
}

