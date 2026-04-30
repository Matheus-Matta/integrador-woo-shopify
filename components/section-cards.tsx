"use client"

import { IconPackage, IconUsers, IconAlertCircle, IconCheck, IconLoader2 } from "@tabler/icons-react"
import { useQueueStats } from "@/hooks/useQueueStats"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function SectionCards() {
  const { data: stats, isLoading } = useQueueStats()

  const cards = [
    {
      title: "Pedidos em Fila",
      value: stats ? stats.orders.waiting + stats.orders.active : 0,
      description: "Aguardando processamento",
      icon: <IconLoader2 className="animate-spin text-blue-500" />,
      footer: `${stats?.orders.active ?? 0} processando agora`,
      trend: stats?.orders.active ? "warning" : "default"
    },
    {
      title: "Pedidos Concluídos",
      value: stats?.orders.completed ?? 0,
      description: "Sincronizados com sucesso",
      icon: <IconCheck className="text-green-500" />,
      footer: "Últimas 24 horas",
      trend: "success"
    },
    {
      title: "Produtos em Fila",
      value: stats ? stats.products.waiting + stats.products.active : 0,
      description: "Atualizações pendentes",
      icon: <IconPackage className="text-purple-500" />,
      footer: `${stats?.products.active ?? 0} ativos`,
      trend: "default"
    },
    {
      title: "Falhas Totais",
      value: (stats?.orders.failed ?? 0) + (stats?.products.failed ?? 0),
      description: "Erros de sincronização",
      icon: <IconAlertCircle className="text-red-500" />,
      footer: "Necessitam atenção",
      trend: (stats?.orders.failed ?? 0) + (stats?.products.failed ?? 0) > 0 ? "destructive" : "default"
    }
  ]

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {cards.map((card, i) => (
        <Card key={i} className="@container/card">
          <CardHeader>
            <CardDescription>{card.title}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {isLoading ? "..." : card.value.toLocaleString()}
            </CardTitle>
            <CardAction>
              <div className="p-2 bg-muted rounded-full">
                {card.icon}
              </div>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              {card.footer}
            </div>
            <div className="text-muted-foreground">
              {card.description}
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
