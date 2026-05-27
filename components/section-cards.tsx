"use client"

import {
  IconShoppingCart,
  IconAlertCircle,
  IconLoader2,
  IconAlertTriangle,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
} from "@tabler/icons-react"
import { useQueueStats } from "@/hooks/useQueueStats"
import { useDashboardStats } from "@/hooks/useDashboardStats"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

// ─── Trend helper ─────────────────────────────────────────────────────────────

function calcTrend(today: number, yesterday: number) {
  if (today === 0 && yesterday === 0) return { pct: 0, dir: "flat" as const }
  if (yesterday === 0) return { pct: 100, dir: "up" as const }
  const raw = Math.round(((today - yesterday) / yesterday) * 100)
  return { pct: Math.abs(raw), dir: raw > 0 ? "up" as const : raw < 0 ? "down" as const : "flat" as const }
}

function TrendBadge({
  today,
  yesterday,
  invertColor = false,
}: {
  today: number
  yesterday: number
  invertColor?: boolean
}) {
  const { pct, dir } = calcTrend(today, yesterday)

  if (dir === "flat") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <IconMinus size={13} />
        Igual a ontem
      </span>
    )
  }

  const isPositive = invertColor ? dir === "down" : dir === "up"
  const color = isPositive ? "text-green-500" : "text-destructive"
  const Icon = dir === "up" ? IconTrendingUp : IconTrendingDown
  const label = `${dir === "up" ? "+" : "-"}${pct}% vs ontem`

  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon size={13} />
      {label}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SectionCards() {
  const { data: queue, isLoading: loadingQueue } = useQueueStats()
  const { data: stats, isLoading: loadingStats } = useDashboardStats()

  const loading = loadingQueue || loadingStats

  const ordersToday     = stats?.summary.orders.today.success     ?? 0
  const ordersYesterday = stats?.summary.orders.yesterday.success ?? 0
  const errToday        = stats?.summary.errors.today             ?? 0
  const errYesterday    = stats?.summary.errors.yesterday         ?? 0
  const queueActive     = (queue?.orders.waiting ?? 0) + (queue?.orders.active ?? 0)
  const queueFailed     = (queue?.orders.failed  ?? 0) + (queue?.products.failed ?? 0)

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">

      {/* ── Pedidos hoje ──────────────────────────────────────────────────── */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Pedidos Hoje</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {loading ? "..." : ordersToday.toLocaleString("pt-BR")}
          </CardTitle>
          <CardAction>
            <div className="p-2 bg-primary/10 rounded-full">
              <IconShoppingCart className="text-primary" size={18} />
            </div>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {!loading && <TrendBadge today={ordersToday} yesterday={ordersYesterday} />}
          <div className="text-muted-foreground">Sincronizados com sucesso</div>
        </CardFooter>
      </Card>

      {/* ── Erros hoje ────────────────────────────────────────────────────── */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Erros Registrados</CardDescription>
          <CardTitle
            className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${
              errToday > 0 ? "text-destructive" : ""
            }`}
          >
            {loading ? "..." : errToday.toLocaleString("pt-BR")}
          </CardTitle>
          <CardAction>
            <div className={`p-2 rounded-full ${errToday > 0 ? "bg-destructive/10" : "bg-muted"}`}>
              <IconAlertCircle
                size={18}
                className={errToday > 0 ? "text-destructive" : "text-muted-foreground"}
              />
            </div>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {!loading && (
            <TrendBadge today={errToday} yesterday={errYesterday} invertColor />
          )}
          <div className="text-muted-foreground">Nas últimas 24 horas</div>
        </CardFooter>
      </Card>

      {/* ── Na fila agora ─────────────────────────────────────────────────── */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Na Fila Agora</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {loadingQueue ? "..." : queueActive.toLocaleString("pt-BR")}
          </CardTitle>
          <CardAction>
            <div className="p-2 bg-blue-500/10 rounded-full">
              <IconLoader2
                size={18}
                className={queueActive > 0 ? "animate-spin text-blue-500" : "text-muted-foreground"}
              />
            </div>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">
            {queue?.orders.active ?? 0} processando · {queue?.orders.waiting ?? 0} aguardando
          </div>
          <div className="text-muted-foreground">Pedidos e produtos</div>
        </CardFooter>
      </Card>

      {/* ── Falhas na fila ────────────────────────────────────────────────── */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Falhas na Fila</CardDescription>
          <CardTitle
            className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${
              queueFailed > 0 ? "text-destructive" : ""
            }`}
          >
            {loadingQueue ? "..." : queueFailed.toLocaleString("pt-BR")}
          </CardTitle>
          <CardAction>
            <div className={`p-2 rounded-full ${queueFailed > 0 ? "bg-destructive/10" : "bg-muted"}`}>
              <IconAlertTriangle
                size={18}
                className={queueFailed > 0 ? "text-destructive" : "text-muted-foreground"}
              />
            </div>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={`font-medium ${queueFailed > 0 ? "text-destructive" : ""}`}>
            {queueFailed > 0 ? "Necessitam atenção" : "Nenhuma falha pendente"}
          </div>
          <div className="text-muted-foreground">Jobs com erro no BullMQ</div>
        </CardFooter>
      </Card>
    </div>
  )
}
