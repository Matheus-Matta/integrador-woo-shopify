"use client"

import { useEffect, useState, useCallback } from "react"
import {
  IconDeviceMobile,
  IconBellRinging,
  IconCalendarRepeat,
  IconRefresh,
  IconChartBar,
  IconTrendingUp,
  IconUsers,
} from "@tabler/icons-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { DateRangeFilter, filterToParams, type DateFilterValue } from "@/components/date-range-filter"

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportData = {
  granularity: "hour" | "day"
  period: number
  devices: {
    total: number
    withUserId: number
    anonymous: number
    newInPeriod: number
    byPeriod: { date: string; count: number }[]
  }
  notifications: {
    totalSent: number
    scheduledSent: number
    manualSent: number
    activeSchedules: number
    byTemplate: { title: string; sends: number; recipients: number }[]
  }
}

const chartConfig = {
  count: { label: "Novos dispositivos", color: "var(--primary)" },
} satisfies ChartConfig

// ── Label helpers ─────────────────────────────────────────────────────────────

function xLabel(key: string, granularity: "hour" | "day") {
  if (granularity === "hour") return key.substring(11, 13) + "h"
  return new Date(key + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
}

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

// ── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  accent?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-5">
        <div className={cn("rounded-lg p-2.5 shrink-0", accent ?? "bg-primary/10")}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums">
            {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
          </p>
          <p className="text-sm font-medium text-foreground">{label}</p>
          {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RelatorioPage() {
  const [filter, setFilter]   = useState<DateFilterValue>({ mode: "30d" })
  const [data, setData]       = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)

  const load = useCallback(async (f: DateFilterValue) => {
    setLoading(true)
    setApiError(null)
    try {
      const params = filterToParams(f)
      const res = await fetch(`/api/dashboard/push-notifications/report?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      setData(await res.json())
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar relatório"
      setApiError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reload when filter changes (custom already validated before calling onChange)
  useEffect(() => { load(filter) }, [filter, load])

  const granularity = data?.granularity ?? "day"

  const pctScheduled = data && data.notifications.totalSent > 0
    ? Math.round((data.notifications.scheduledSent / data.notifications.totalSent) * 100)
    : 0

  const hasChartData = data && data.devices.byPeriod.some((d) => d.count > 0)

  return (
    <div className="flex flex-col gap-6">

      {/* API error banner */}
      {apiError && !loading && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="font-medium">Erro ao carregar:</span> {apiError}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm text-muted-foreground pt-1">
          {filter.mode === "24h" ? (
            <>Dados das últimas <strong className="text-foreground">24 horas</strong></>
          ) : filter.mode === "custom" && filter.from && filter.to ? (
            <>
              Período:{" "}
              <strong className="text-foreground">
                {new Date(filter.from + "T12:00:00").toLocaleDateString("pt-BR")}
              </strong>
              {" → "}
              <strong className="text-foreground">
                {new Date(filter.to + "T12:00:00").toLocaleDateString("pt-BR")}
              </strong>
            </>
          ) : (
            <>
              Dados dos últimos{" "}
              <strong className="text-foreground">{filter.mode === "7d" ? "7" : "30"} dias</strong>
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <DateRangeFilter value={filter} onChange={setFilter} disabled={loading} />
          <Button variant="outline" size="sm" onClick={() => load(filter)} disabled={loading} className="gap-1.5 h-7 shrink-0">
            <IconRefresh className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<IconDeviceMobile className="h-5 w-5 text-primary" />}
          label="Total de dispositivos"
          value={loading ? "..." : data?.devices.total ?? 0}
          sub={loading ? "" : `${data?.devices.withUserId ?? 0} com login · ${data?.devices.anonymous ?? 0} anônimos`}
          accent="bg-primary/10"
        />
        <StatCard
          icon={<IconTrendingUp className="h-5 w-5 text-green-500" />}
          label="Novos dispositivos"
          value={loading ? "..." : data?.devices.newInPeriod ?? 0}
          sub="no período selecionado"
          accent="bg-green-500/10"
        />
        <StatCard
          icon={<IconBellRinging className="h-5 w-5 text-blue-500" />}
          label="Notificações enviadas"
          value={loading ? "..." : data?.notifications.totalSent ?? 0}
          sub={loading ? "" : `${data?.notifications.manualSent ?? 0} manuais · ${data?.notifications.scheduledSent ?? 0} agendadas`}
          accent="bg-blue-500/10"
        />
        <StatCard
          icon={<IconCalendarRepeat className="h-5 w-5 text-purple-500" />}
          label="Agendamentos ativos"
          value={loading ? "..." : data?.notifications.activeSchedules ?? 0}
          sub={`${pctScheduled}% dos envios foram agendados`}
          accent="bg-purple-500/10"
        />
      </div>

      {/* Gráfico — novos dispositivos por hora/dia */}
      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2">
            <IconChartBar className="h-5 w-5" />
            Novos dispositivos por {granularity === "hour" ? "hora" : "dia"}
          </CardTitle>
          <CardDescription>
            Registros no período selecionado — total: {loading ? "..." : data?.devices.newInPeriod ?? 0}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 px-2 sm:px-6">
          {loading ? (
            <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">
              Carregando...
            </div>
          ) : !hasChartData ? (
            <div className="h-44 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <IconDeviceMobile className="h-8 w-8 opacity-30" />
              <p className="text-sm">Nenhum dispositivo novo no período</p>
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-44 w-full">
              <BarChart
                data={data!.devices.byPeriod}
                margin={{ top: 4, right: 4, bottom: 0, left: -16 }}
                barSize={granularity === "hour" ? 10 : (filter.mode === "7d" ? 24 : 10)}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={granularity === "hour" ? 30 : 28}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => xLabel(v, granularity)}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  tick={{ fontSize: 11 }}
                  width={28}
                  allowDecimals={false}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => tooltipLabel(v, granularity)}
                    />
                  }
                />
                <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Modelos mais enviados */}
      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2">
            <IconUsers className="h-5 w-5" />
            Modelos mais enviados
          </CardTitle>
          <CardDescription>
            Top 10 notificações pelo título no período selecionado
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
          ) : !data || data.notifications.byTemplate.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <IconBellRinging className="h-8 w-8 opacity-30" />
              <p className="text-sm">Nenhuma notificação enviada no período.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Título (modelo)</TableHead>
                  <TableHead className="text-right">Envios</TableHead>
                  <TableHead className="text-right">Destinatários</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Média / envio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.notifications.byTemplate.map((t, i) => (
                  <TableRow key={t.title}>
                    <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                    <TableCell className="font-medium text-sm max-w-60 truncate">{t.title}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.sends.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.recipients.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right hidden sm:table-cell text-muted-foreground text-sm tabular-nums">
                      {t.sends > 0 ? Math.round(t.recipients / t.sends).toLocaleString("pt-BR") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Breakdown: manuais vs agendados */}
      {data && data.notifications.totalSent > 0 && (
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="flex items-center gap-2">
              <IconBellRinging className="h-5 w-5" />
              Origem dos envios
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 flex flex-col gap-4">
            {[
              { label: "Manual (dashboard)",    value: data.notifications.manualSent,    color: "bg-primary"     },
              { label: "Agendado (automático)", value: data.notifications.scheduledSent, color: "bg-purple-500"  },
            ].map((item) => {
              const pct = Math.round((item.value / data.notifications.totalSent) * 100)
              return (
                <div key={item.label} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-medium tabular-nums">
                      {item.value.toLocaleString("pt-BR")} · {pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", item.color)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
