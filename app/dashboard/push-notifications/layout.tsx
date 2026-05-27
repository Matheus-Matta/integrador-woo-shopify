"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconBell,
  IconSend,
  IconLayoutList,
  IconCalendarRepeat,
  IconHistory,
  IconDeviceMobile,
  IconChartBar,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"

const tabs = [
  { label: "Modelos",      href: "/dashboard/push-notifications",             icon: IconLayoutList },
  { label: "Enviar",       href: "/dashboard/push-notifications/enviar",       icon: IconSend },
  { label: "Agendamentos", href: "/dashboard/push-notifications/agendamentos", icon: IconCalendarRepeat },
  { label: "Relatório",    href: "/dashboard/push-notifications/relatorio",    icon: IconChartBar },
  { label: "Histórico",    href: "/dashboard/push-notifications/historico",    icon: IconHistory },
  { label: "Dispositivos", href: "/dashboard/push-notifications/dispositivos", icon: IconDeviceMobile },
]

export default function PushNotificationsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6 animate-slide-up">
      <div className="flex items-center gap-2">
        <IconBell className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Push Notifications</h1>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/dashboard/push-notifications"
              ? pathname === tab.href
              : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap shrink-0",
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
