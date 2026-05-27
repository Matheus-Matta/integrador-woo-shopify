"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { IconLoader2, IconRefresh } from "@tabler/icons-react"

import { getDashboardStats } from "@/services/api"
import { DateRangeFilter, type DateFilterValue } from "@/components/date-range-filter"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const chartConfig = {
  orders: { label: "Pedidos", color: "var(--primary)"     },
  errors: { label: "Erros",   color: "var(--destructive)" },
} satisfies ChartConfig

// ── Label helpers ─────────────────────────────────────────────────────────────

/** "YYYY-MM-DDTHH:00:00" → "14h" */
function hourLabel(key: string) {
  return key.substring(11, 13) + "h"
}

/** "YYYY-MM-DD" → "26 jan" */
function dayLabel(key: string) {
  return new Date(key + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "numeric", month: "short",
  })
}

/** full tooltip label */
function tooltipLabel(key: string, granularity: "hour" | "day") {
  if (granularity === "hour") {
    const date = key.substring(0, 10)
    const hour = key.substring(11, 13)
    const d = new Date(date + "T12:00:00")
    return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }) + ` ${hour}h`
  }
  return new Date(key + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "short", day: "numeric", month: "short",
  })
}

// ── Convert filter to StatsParams ─────────────────────────────────────────────

function filterToStatsParams(f: DateFilterValue) {
  if (f.mode === "24h")                          return { hours: 24 }
  if (f.mode === "custom" && f.from && f.to)     return { from: f.from, to: f.to }
  if (f.mode === "7d")                           return { days: 7 }
  return { days: 30 }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChartAreaInteractive() {
  const [filter, setFilter] = React.useState<DateFilterValue>({ mode: "30d" })

  const statsParams = filterToStatsParams(filter)

  const { data: stats, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["dashboard-chart", statsParams],
    queryFn: () => getDashboardStats(statsParams),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const granularity = stats?.granularity ?? "day"
  const chartData   = stats?.chart ?? []

  const totalOrders = chartData.reduce((s, d) => s + d.orders, 0)
  const totalErrors = chartData.reduce((s, d) => s + d.errors, 0)

  return (
    <Card className="@container/card">
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle>Sincronizações por {granularity === "hour" ? "Hora" : "Dia"}</CardTitle>
          <CardDescription>
            {isLoading ? (
              "Carregando..."
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {totalOrders.toLocaleString("pt-BR")} pedidos
                </span>{" "}
                e{" "}
                <span className="font-medium text-destructive">
                  {totalErrors.toLocaleString("pt-BR")} erros
                </span>{" "}
                no período selecionado
              </>
            )}
          </CardDescription>
        </div>

        <CardAction>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={isFetching}
              onClick={() => refetch()}
            >
              <IconRefresh className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </CardAction>
      </CardHeader>

      {/* Filter bar */}
      <div className="px-6 pb-2">
        <DateRangeFilter value={filter} onChange={setFilter} disabled={isFetching} />
      </div>

      <CardContent className="px-2 pt-2 sm:px-6 sm:pt-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-60">
            <IconLoader2 className="animate-spin text-muted-foreground h-6 w-6" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-60 text-sm text-muted-foreground">
            Nenhum dado disponível para este período.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-60 w-full">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="fillOrders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-orders)" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="var(--color-orders)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="fillErrors" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-errors)" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="var(--color-errors)" stopOpacity={0.05} />
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />

              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={granularity === "hour" ? 30 : 28}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => granularity === "hour" ? hourLabel(v) : dayLabel(v)}
              />

              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                tick={{ fontSize: 11 }}
                width={30}
                allowDecimals={false}
              />

              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(v) => tooltipLabel(v, granularity)}
                    indicator="dot"
                  />
                }
              />

              <Area
                dataKey="orders"
                type="monotone"
                fill="url(#fillOrders)"
                stroke="var(--color-orders)"
                strokeWidth={2}
              />
              <Area
                dataKey="errors"
                type="monotone"
                fill="url(#fillErrors)"
                stroke="var(--color-errors)"
                strokeWidth={2}
              />

              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
