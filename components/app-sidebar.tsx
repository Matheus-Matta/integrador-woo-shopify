"use client"

import * as React from "react"
import {
  IconDashboard,
  IconListDetails,
  IconWebhook,
  IconAlertTriangle,
  IconHelp,
  IconInnerShadowTop,
  IconSettings,
  IconPlug,
  IconClock,
} from "@tabler/icons-react"
import Link from "next/link"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const data = {
  user: {
    name: "Admin User",
    email: "admin@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: IconDashboard,
    },
    {
      title: "Integração",
      url: "#",
      icon: IconPlug,
      isActive: true,
      items: [
        {
          title: "Clientes",
          url: "/dashboard/customers",
        },
        {
          title: "Produtos",
          url: "/dashboard/products",
        },
        {
          title: "Pedidos",
          url: "/dashboard/orders",
        },
        {
          title: "Filas",
          url: "/dashboard/queues",
        },
        {
          title: "Erros",
          url: "/dashboard/errors",
        },
      ],
    },
  ],
  navSecondary: [
    {
      title: "Config. Integração",
      url: "/dashboard/settings/integration",
      icon: IconSettings,
    },
    {
      title: "Config. Webhook",
      url: "/dashboard/settings/webhooks",
      icon: IconWebhook,
    },
    {
      title: "Config. Scheduler",
      url: "/dashboard/settings/scheduler",
      icon: IconClock,
    },
    {
      title: "Ajuda",
      url: "#",
      icon: IconHelp,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/dashboard" />}
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <IconInnerShadowTop className="size-5!" />
              <span className="text-base font-semibold">
                {process.env.NEXT_PUBLIC_APP_NAME || "Integrador Woo"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
