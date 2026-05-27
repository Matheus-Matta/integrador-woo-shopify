"use client"

import { useEffect, useState, useCallback } from "react"
import {
  IconSend,
  IconUsers,
  IconUser,
  IconCalendarRepeat,
  IconBellRinging,
  IconAlertTriangle,
  IconShieldCheck,
  IconDeviceMobile,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const FREQUENCY_OPTIONS = [
  { value: "every_1h",   label: "A cada 1 hora" },
  { value: "every_6h",   label: "A cada 6 horas" },
  { value: "every_12h",  label: "A cada 12 horas" },
  { value: "daily_9h",   label: "Diário às 9h" },
  { value: "daily_18h",  label: "Diário às 18h" },
  { value: "weekly_mon", label: "Semanal (seg às 9h)" },
  { value: "monthly_1",  label: "Mensal (dia 1 às 9h)" },
]

type Template = { _id: string; name: string; title: string; body: string; url: string }

export default function EnviarPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [deviceCount, setDeviceCount] = useState<number | null>(null)
  const [loadingTemplates, setLoadingTemplates] = useState(true)

  const [templateId, setTemplateId] = useState("")
  const [mode, setMode] = useState<"broadcast" | "individual">("broadcast")
  const [userId, setUserId] = useState("")
  const [recurring, setRecurring] = useState(false)
  const [frequency, setFrequency] = useState("daily_9h")
  const [lgpdConsent, setLgpdConsent] = useState(false)
  const [sending, setSending] = useState(false)

  const selectedTemplate = templates.find((t) => t._id === templateId)

  const loadData = useCallback(async () => {
    setLoadingTemplates(true)
    try {
      const [tRes, dRes] = await Promise.all([
        fetch("/api/dashboard/push-notifications/templates"),
        fetch("/api/dashboard/push-notifications/tokens"),
      ])
      const tData: Template[] = await tRes.json()
      const dData: unknown[] = await dRes.json()
      setTemplates(tData)
      setDeviceCount(Array.isArray(dData) ? dData.length : 0)
      if (tData.length > 0) setTemplateId(tData[0]._id)
    } catch {
      toast.error("Erro ao carregar dados")
    } finally {
      setLoadingTemplates(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!templateId) { toast.error("Selecione um modelo"); return }
    if (mode === "individual" && !userId.trim()) { toast.error("Informe o userId"); return }
    if (recurring && !lgpdConsent) { toast.error("Confirme o consentimento LGPD para envio recorrente"); return }

    setSending(true)
    try {
      if (recurring) {
        // Cria agendamento
        const res = await fetch("/api/dashboard/push-notifications/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId, mode, userId: userId.trim(), frequency, lgpdConsent }),
        })
        const data = await res.json()
        if (!res.ok) { toast.error(data.error ?? "Erro ao criar agendamento"); return }
        toast.success("Agendamento criado! Veja a aba Agendamentos.")
        setLgpdConsent(false)
      } else {
        // Envio imediato
        const res = await fetch("/api/dashboard/push-notifications/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            userId: userId.trim(),
            title: selectedTemplate?.title,
            body: selectedTemplate?.body,
            data: selectedTemplate?.url ? { url: selectedTemplate.url } : undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok || data.error) { toast.error(data.error ?? "Falha ao enviar"); return }
        if (mode === "broadcast") {
          toast.success(`Broadcast enviado para ${data.sent} dispositivo(s)`)
        } else {
          toast.success("Notificação enviada com sucesso!")
        }
      }
    } catch {
      toast.error("Erro ao processar envio")
    } finally {
      setSending(false)
    }
  }

  if (loadingTemplates) {
    return <p className="text-sm text-muted-foreground py-6">Carregando...</p>
  }

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
          <IconBellRinging className="h-8 w-8 opacity-30" />
          <p className="text-sm font-medium">Nenhum modelo cadastrado</p>
          <p className="text-xs text-center">Crie um modelo na aba <strong>Modelos</strong> antes de enviar notificações.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stat rápida */}
      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        <IconDeviceMobile className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">
          {deviceCount === null ? "—" : <><strong className="text-foreground">{deviceCount}</strong> dispositivo(s) registrado(s)</>}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Modelo */}
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Modelo de notificação</CardTitle>
            <CardDescription>Selecione um modelo salvo ou crie um na aba Modelos.</CardDescription>
          </CardHeader>
          <CardContent className="pt-5 flex flex-col gap-4 max-w-xl">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Modelo</label>
              <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um modelo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {templates.map((t) => (
                      <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {selectedTemplate && (
              <div className="rounded-lg border bg-muted/40 p-4 flex flex-col gap-2 text-sm">
                <p><span className="font-medium">Título:</span> {selectedTemplate.title}</p>
                <p><span className="font-medium">Mensagem:</span> {selectedTemplate.body}</p>
                {selectedTemplate.url && (
                  <p className="text-xs text-muted-foreground"><span className="font-medium">URL:</span> {selectedTemplate.url}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Destinatários */}
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Destinatários</CardTitle>
          </CardHeader>
          <CardContent className="pt-5 flex flex-col gap-4 max-w-xl">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "broadcast" ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setMode("broadcast")}
              >
                <IconUsers className="h-4 w-4" />
                Todos os dispositivos
              </Button>
              <Button
                type="button"
                variant={mode === "individual" ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setMode("individual")}
              >
                <IconUser className="h-4 w-4" />
                Usuário específico
              </Button>
            </div>

            {mode === "individual" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">User ID</label>
                <p className="text-xs text-muted-foreground">Mesmo ID enviado pelo app no registro do token</p>
                <Input placeholder="ex: user_123" value={userId} onChange={(e) => setUserId(e.target.value)} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recorrência */}
        <Card>
          <CardHeader className="border-b pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <IconCalendarRepeat className="h-4 w-4" />
                  Envio recorrente
                </CardTitle>
                <CardDescription className="mt-1">
                  Ative para agendar envios periódicos automáticos.
                </CardDescription>
              </div>
              <Switch
                checked={recurring}
                onCheckedChange={(v) => { setRecurring(v); if (!v) setLgpdConsent(false) }}
              />
            </div>
          </CardHeader>

          {recurring && (
            <CardContent className="pt-5 flex flex-col gap-5 max-w-xl">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Frequência</label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v ?? "daily_9h")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {FREQUENCY_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              {/* LGPD */}
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 flex flex-col gap-3">
                <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <IconShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>
                    Envios recorrentes devem respeitar a <strong>LGPD (Lei 13.709/2018)</strong>. Os usuários devem ter
                    dado consentimento explícito para receber notificações de marketing. Seu app deve oferecer opção de
                    cancelamento (opt-out).
                  </p>
                </div>
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                    checked={lgpdConsent}
                    onChange={(e) => setLgpdConsent(e.target.checked)}
                  />
                  <span className="text-sm">
                    Confirmo que os usuários consentiram o recebimento de notificações conforme a LGPD, e que existe mecanismo de opt-out disponível.
                  </span>
                </label>
              </div>

              {!lgpdConsent && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <IconAlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  Confirme o consentimento LGPD para criar o agendamento.
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Ação */}
        <div className="flex justify-end items-center gap-3">
          {mode === "broadcast" && !recurring && deviceCount === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <IconAlertTriangle className="h-3.5 w-3.5" /> Nenhum dispositivo registrado
            </p>
          )}
          <Button type="submit" disabled={sending} className="gap-2">
            {recurring ? <IconCalendarRepeat className="h-4 w-4" /> : <IconSend className="h-4 w-4" />}
            {sending
              ? "Processando..."
              : recurring
              ? "Criar agendamento"
              : mode === "broadcast"
              ? `Enviar para ${deviceCount ?? "?"} dispositivo(s)`
              : "Enviar notificação"}
          </Button>
        </div>
      </form>
    </div>
  )
}
