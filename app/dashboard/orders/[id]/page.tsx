'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  IconChevronLeft, 
  IconShoppingCart, 
  IconAlertCircle,
  IconInbox,
  IconEye,
} from '@tabler/icons-react';
import {
  Pagination as UIPagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationLink,
} from '@/components/ui/pagination';
import { useEntityDetail } from '@/hooks/useLogs';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogDetailModal } from '@/components/dashboard/LogDetailModal';
import { translateAction } from '@/lib/utils/action-translator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [eventsPage, setEventsPage] = useState(1);
  const [errorsPage, setErrorsPage] = useState(1);
  const { data, isLoading } = useEntityDetail('order', id, { eventsPage, errorsPage, limitEvents: 20, limitErrors: 20 });
  const [selectedRow, setSelectedRow] = useState<any>(null);

  const fmtDate = (val?: string) => {
    if (!val) return '—';
    const d = new Date(val);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(
      d.getHours()
    )}:${p(d.getMinutes())}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <Spinner />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6 animate-slide-up w-full">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
            <IconChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <IconShoppingCart className="h-6 w-6 text-primary" />
              {data.name}
            </h1>
            <span className="text-xs text-muted-foreground">Identificador do Pedido: {data.entityId}</span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="events" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="events">Atividades ({data.eventsTotal})</TabsTrigger>
          <TabsTrigger value="errors">Erros de Sistema ({data.errorsTotal})</TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          <Card>
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle>Histórico de Sincronização</CardTitle>
              <CardDescription>
                Todos os eventos processados para este pedido.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.events.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-16 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <IconInbox className="h-8 w-8 opacity-50" />
                          <p>Nenhum evento registrado.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.events.map((event: any, idx: number) => (
                      <TableRow key={event._id || idx} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {fmtDate(event.timestamp)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize font-medium">
                            {translateAction(event.action)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                           <Badge 
                              variant={event.status === 'success' ? 'default' : 'destructive'}
                              className={event.status === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-none' : ''}
                           >
                              {event.status === 'success' ? 'Sucesso' : event.status === 'skipped' ? 'Pulado' : 'Erro'}
                           </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSelectedRow(event)}
                            className="h-8"
                          >
                            <IconEye className="h-4 w-4 mr-2" />
                            Ver JSON
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {data && data.eventsPages > 1 && (
            <div className="mt-3">
              <UIPagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious onClick={() => setEventsPage(Math.max(1, eventsPage - 1))} />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink isActive aria-disabled>
                      {data.eventsPage} / {data.eventsPages}
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext onClick={() => setEventsPage(Math.min(data.eventsPages, eventsPage + 1))} />
                  </PaginationItem>
                </PaginationContent>
              </UIPagination>
            </div>
          )}
        </TabsContent>

        <TabsContent value="errors">
          <Card className="border-destructive/20">
            <CardHeader className="pb-3 border-b border-destructive/20 bg-destructive/5">
              <CardTitle className="text-destructive flex items-center gap-2">
                <IconAlertCircle className="h-5 w-5" />
                Erros de Sistema
              </CardTitle>
              <CardDescription>
                Erros críticos ou de infraestrutura que afetaram o processamento deste pedido.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Fluxo (Flow)</TableHead>
                    <TableHead>Mensagem de Erro</TableHead>
                    <TableHead className="text-right">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.errors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-16 text-muted-foreground">
                        Nenhum erro registrado para este pedido.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.errors.map((err: any, idx: number) => (
                      <TableRow key={err._id || idx}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {fmtDate(err.timestamp)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-destructive border-destructive/20 bg-destructive/10">
                            {err.flow}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-foreground/80 break-all max-w-lg">
                          {err.error_message}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSelectedRow(err)}
                            className="h-8"
                          >
                            <IconEye className="h-4 w-4 mr-2" />
                            Ver JSON
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {data && data.errorsPages > 1 && (
            <div className="mt-3">
              <UIPagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious onClick={() => setErrorsPage(Math.max(1, errorsPage - 1))} />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink isActive aria-disabled>
                      {data.errorsPage} / {data.errorsPages}
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext onClick={() => setErrorsPage(Math.min(data.errorsPages, errorsPage + 1))} />
                  </PaginationItem>
                </PaginationContent>
              </UIPagination>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {selectedRow && (
        <LogDetailModal row={selectedRow} type={(selectedRow.flow ? 'error' : 'order')} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  );
}
