"use client"

import { useEffect, useState, useCallback } from "react"
import {
  IconHistory,
  IconRefresh,
  IconBell,
  IconUsers,
  IconUser,
  IconCheck,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type PushLog = {
  _id: string
  to: string | string[]
  title: string
  body: string
  sentBy: string
  sentAt: string
  result: unknown
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
}

function toCount(log: PushLog) {
  return Array.isArray(log.to) ? log.to.length : 1
}

export default function HistoricoPage() {
  const [history, setHistory] = useState<PushLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/dashboard/push-notifications/history?limit=50")
      setHistory(await res.json())
    } catch {
      toast.error("Erro ao carregar histórico")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconHistory className="h-5 w-5" />
              Histórico de envios
            </CardTitle>
            <CardDescription className="mt-1">
              Últimas 50 notificações enviadas. Registros expiram automaticamente em 90 dias.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <IconRefresh className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <IconBell className="h-8 w-8 opacity-30" />
            <p className="text-sm">Nenhuma notificação enviada ainda.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead className="hidden md:table-cell">Mensagem</TableHead>
                <TableHead>Dest.</TableHead>
                <TableHead className="hidden sm:table-cell">Enviado por</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-10 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((log) => {
                const hasError =
                  log.result &&
                  typeof log.result === "object" &&
                  "errors" in (log.result as Record<string, unknown>)
                const count = toCount(log)
                return (
                  <TableRow key={log._id}>
                    <TableCell className="font-medium text-sm max-w-40 truncate">{log.title}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-50 truncate">{log.body}</TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-1">
                        {count > 1
                          ? <IconUsers className="h-3.5 w-3.5 text-muted-foreground" />
                          : <IconUser className="h-3.5 w-3.5 text-muted-foreground" />}
                        {count}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{log.sentBy}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(log.sentAt)}</TableCell>
                    <TableCell className="text-center">
                      {hasError
                        ? <IconX className="h-4 w-4 text-destructive mx-auto" />
                        : <IconCheck className="h-4 w-4 text-green-500 mx-auto" />}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
