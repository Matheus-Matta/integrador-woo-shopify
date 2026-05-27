"use client"

import { useEffect, useState, useCallback } from "react"
import {
  IconCalendarRepeat,
  IconTrash,
  IconRefresh,
  IconUsers,
  IconUser,
  IconAlertTriangle,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const FREQUENCY_LABELS: Record<string, string> = {
  every_1h:   "A cada 1 hora",
  every_6h:   "A cada 6 horas",
  every_12h:  "A cada 12 horas",
  daily_9h:   "Diário às 9h",
  daily_18h:  "Diário às 18h",
  weekly_mon: "Semanal (seg às 9h)",
  monthly_1:  "Mensal (dia 1 às 9h)",
}

type Schedule = {
  _id: string
  templateName: string
  mode: "broadcast" | "individual"
  userId: string
  frequency: string
  active: boolean
  createdAt: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
}

export default function AgendamentosPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/dashboard/push-notifications/schedules")
      setSchedules(await res.json())
    } catch {
      toast.error("Erro ao carregar agendamentos")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleToggle(id: string, active: boolean) {
    setTogglingId(id)
    try {
      const res = await fetch(`/api/dashboard/push-notifications/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      })
      if (!res.ok) { toast.error("Erro ao atualizar agendamento"); return }
      setSchedules((prev) => prev.map((s) => s._id === id ? { ...s, active } : s))
      toast.success(active ? "Agendamento ativado" : "Agendamento pausado")
    } catch {
      toast.error("Erro ao atualizar agendamento")
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/dashboard/push-notifications/schedules/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Erro ao excluir"); return }
      setSchedules((prev) => prev.filter((s) => s._id !== id))
      toast.success("Agendamento removido")
    } catch {
      toast.error("Erro ao excluir agendamento")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <IconCalendarRepeat className="h-5 w-5" />
                Agendamentos ativos
              </CardTitle>
              <CardDescription className="mt-1">
                Notificações recorrentes programadas. Pause ou exclua quando necessário.
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
          ) : schedules.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <IconCalendarRepeat className="h-8 w-8 opacity-30" />
              <p className="text-sm">Nenhum agendamento criado ainda.</p>
              <p className="text-xs">Vá até a aba <strong>Enviar</strong> e ative a opção de envio recorrente.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Destinatários</TableHead>
                  <TableHead>Frequência</TableHead>
                  <TableHead className="hidden md:table-cell">Criado em</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => (
                  <TableRow key={s._id} className={!s.active ? "opacity-50" : ""}>
                    <TableCell className="font-medium text-sm">{s.templateName || "—"}</TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-1.5">
                        {s.mode === "broadcast" ? (
                          <><IconUsers className="h-3.5 w-3.5 text-muted-foreground" /> Todos</>
                        ) : (
                          <><IconUser className="h-3.5 w-3.5 text-muted-foreground" /> {s.userId || "—"}</>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {FREQUENCY_LABELS[s.frequency] ?? s.frequency}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(s.createdAt)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={s.active}
                        onCheckedChange={(v) => handleToggle(s._id, v)}
                        disabled={togglingId === s._id}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={deletingId === s._id}
                        onClick={() => handleDelete(s._id)}
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Aviso LGPD */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 border">
        <IconAlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
        <p>
          <strong>LGPD:</strong> Envios recorrentes exigem consentimento explícito dos usuários. Certifique-se de que seu app oferece mecanismo de opt-out (cancelamento) funcional.
        </p>
      </div>
    </div>
  )
}
