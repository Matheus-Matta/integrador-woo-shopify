"use client"

import { useEffect, useState, useCallback } from "react"
import {
  IconLayoutList,
  IconPlus,
  IconTrash,
  IconDeviceFloppy,
  IconAlertTriangle,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Template = {
  _id: string
  name: string
  title: string
  body: string
  url: string
  createdAt: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
}

export default function ModelosPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [form, setForm] = useState({ name: "", title: "", body: "", url: "" })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/dashboard/push-notifications/templates")
      setTemplates(await res.json())
    } catch {
      toast.error("Erro ao carregar modelos")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.title.trim() || !form.body.trim()) {
      toast.error("Nome, título e mensagem são obrigatórios")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/dashboard/push-notifications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Erro ao criar modelo"); return }
      toast.success("Modelo criado com sucesso!")
      setForm({ name: "", title: "", body: "", url: "" })
      setTemplates((prev) => [data, ...prev])
    } catch {
      toast.error("Erro ao criar modelo")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/dashboard/push-notifications/templates/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Erro ao excluir"); return }
      setTemplates((prev) => prev.filter((t) => t._id !== id))
      toast.success("Modelo excluído")
    } catch {
      toast.error("Erro ao excluir modelo")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Criar modelo */}
      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2">
            <IconPlus className="h-5 w-5 text-primary" />
            Novo Modelo
          </CardTitle>
          <CardDescription>
            Crie modelos reutilizáveis para suas notificações push.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={handleCreate} className="flex flex-col gap-4 max-w-xl">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Nome interno</label>
              <p className="text-xs text-muted-foreground">Label para identificar o modelo no dashboard</p>
              <Input
                placeholder="ex: Promoção de feriado"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Título da notificação</label>
              <Input
                placeholder="ex: 🎉 Oferta especial para você!"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Mensagem</label>
              <textarea
                className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                placeholder="ex: Aproveite 30% de desconto só hoje!"
                value={form.body}
                onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">URL de destino <span className="text-muted-foreground font-normal">(opcional)</span></label>
              <p className="text-xs text-muted-foreground">Link que o app abrirá ao tocar na notificação</p>
              <Input
                placeholder="ex: https://seusite.com/ofertas"
                value={form.url}
                onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving} className="gap-2">
                <IconDeviceFloppy className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar modelo"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Lista de modelos */}
      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2">
            <IconLayoutList className="h-5 w-5" />
            Modelos salvos
          </CardTitle>
          <CardDescription>
            {loading ? "Carregando..." : `${templates.length} modelo(s) registrado(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <IconLayoutList className="h-8 w-8 opacity-30" />
              <p className="text-sm">Nenhum modelo criado ainda.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead className="hidden md:table-cell">Mensagem</TableHead>
                  <TableHead className="hidden lg:table-cell">URL</TableHead>
                  <TableHead className="hidden md:table-cell">Criado em</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t._id}>
                    <TableCell className="font-medium text-sm">{t.name}</TableCell>
                    <TableCell className="text-sm">{t.title}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-50 truncate">{t.body}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-40 truncate">{t.url || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">{formatDate(t.createdAt)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={deletingId === t._id}
                        onClick={() => handleDelete(t._id)}
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
    </div>
  )
}
