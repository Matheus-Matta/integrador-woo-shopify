"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconAlertCircle, IconArrowLeft, IconEye, IconInbox } from "@tabler/icons-react";
import { useEntityDetail } from "@/hooks/useLogs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/Spinner";
import { LogDetailModal } from "@/components/dashboard/LogDetailModal";
import { translateAction } from "@/lib/utils/action-translator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Type = "product" | "order" | "customer";

function fmtDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function LogEntityDetailPage({ type, id }: { type: Type; id: string }) {
  const router = useRouter();
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const { data, isLoading } = useEntityDetail(type, decodeURIComponent(id), {
    eventsPage: 1,
    errorsPage: 1,
    limitEvents: 50,
    limitErrors: 50,
  });

  const label = type === "product" ? "produto" : type === "order" ? "pedido" : "cliente";

  if (isLoading) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <IconArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Logs de {data.name || label}</h1>
          <p className="text-sm text-muted-foreground">Histórico relacionado ao {label}: {data.entityId}</p>
        </div>
      </div>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Atividades ({data.eventsTotal})</TabsTrigger>
          <TabsTrigger value="errors">Erros ({data.errorsTotal})</TabsTrigger>
        </TabsList>
        <TabsContent value="events" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Atividades</CardTitle>
              <CardDescription>Eventos processados para este registro.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">JSON</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.events.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                        <IconInbox className="mx-auto mb-2 h-7 w-7 opacity-60" />
                        Nenhum evento registrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.events.map((event: any, index: number) => (
                      <TableRow key={event._id || index}>
                        <TableCell>{fmtDate(event.timestamp)}</TableCell>
                        <TableCell>{translateAction(event.action)}</TableCell>
                        <TableCell><Badge variant="outline">{event.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedRow(event)}>
                            <IconEye className="mr-2 h-4 w-4" />
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="errors" className="mt-4">
          <Card className="border-destructive/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <IconAlertCircle className="h-5 w-5" />
                Erros
              </CardTitle>
              <CardDescription>Falhas registradas para este item.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Fluxo</TableHead>
                    <TableHead>Mensagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.errors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-12 text-center text-muted-foreground">Nenhum erro registrado.</TableCell>
                    </TableRow>
                  ) : (
                    data.errors.map((error: any, index: number) => (
                      <TableRow key={error._id || index}>
                        <TableCell>{fmtDate(error.timestamp)}</TableCell>
                        <TableCell><Badge variant="destructive">{error.flow}</Badge></TableCell>
                        <TableCell>{error.error_message}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {selectedRow && <LogDetailModal row={selectedRow} type={type} onClose={() => setSelectedRow(null)} />}
    </div>
  );
}
