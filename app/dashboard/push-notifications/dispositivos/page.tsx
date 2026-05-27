"use client"

import { useEffect, useState, useCallback } from "react"
import {
  IconDeviceMobile,
  IconRefresh,
  IconTrash,
  IconUsers,
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

type DeviceToken = {
  _id: string
  userId: string
  token: string
  platform: "android" | "ios" | "unknown"
  label: string
  createdAt: string
  updatedAt: string
}

const platformBadge: Record<string, string> = {
  android: "bg-green-500/10 text-green-600 border-green-500/30",
  ios:     "bg-blue-500/10 text-blue-600 border-blue-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
}

export default function DispositivosPage() {
  const [tokens, setTokens] = useState<DeviceToken[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/dashboard/push-notifications/tokens")
      setTokens(await res.json())
    } catch {
      toast.error("Erro ao carregar dispositivos")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/dashboard/push-notifications/tokens/${id}`, { method: "DELETE" })
      if (!res.ok) { toast.error("Erro ao remover token"); return }
      setTokens((prev) => prev.filter((t) => t._id !== id))
      toast.success("Token removido")
    } catch {
      toast.error("Erro ao remover token")
    } finally {
      setDeletingId(null)
    }
  }

  const uniqueUsers = new Set(tokens.map((t) => t.userId)).size

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <div className="rounded-lg bg-primary/10 p-2">
              <IconDeviceMobile className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold">{loading ? "—" : tokens.length}</p>
              <p className="text-xs text-muted-foreground">Dispositivos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <IconUsers className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xl font-bold">{loading ? "—" : uniqueUsers}</p>
              <p className="text-xs text-muted-foreground">Usuários únicos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <IconDeviceMobile className="h-5 w-5" />
                Dispositivos registrados
              </CardTitle>
              <CardDescription className="mt-1">
                Tokens enviados pelo app mobile. O app deve chamar{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">POST /api/device-token</code>{" "}
                após o login.
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
          ) : tokens.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <IconDeviceMobile className="h-8 w-8 opacity-30" />
              <p className="text-sm">Nenhum dispositivo registrado ainda.</p>
              <p className="text-xs text-center max-w-sm">
                O app mobile deve chamar <code className="bg-muted px-1 rounded">POST /api/device-token</code> com o ExponentPushToken após o login do usuário.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Plataforma</TableHead>
                  <TableHead className="hidden md:table-cell">Label</TableHead>
                  <TableHead className="hidden lg:table-cell">Token</TableHead>
                  <TableHead className="hidden md:table-cell">Registrado</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((t) => (
                  <TableRow key={t._id}>
                    <TableCell className="font-mono text-xs">{t.userId}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${platformBadge[t.platform]}`}>
                        {t.platform}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{t.label || "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell font-mono text-xs max-w-44 truncate text-muted-foreground">{t.token}</TableCell>
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
