'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconRefresh, IconInbox, IconChevronRight } from '@tabler/icons-react';
import type { LogType, LogsFilters } from '@/types';
import { useEntityLogs } from '@/hooks/useLogs';
import { Spinner } from '../ui/Spinner';
import {
  Pagination as UIPagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationLink,
} from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface LogsEntityTableProps {
  type: Exclude<LogType, 'error'>;
}

export function LogsEntityTable({ type }: LogsEntityTableProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<LogsFilters>({ type, page: 1, limit: 20, search: '' });
  const { data, isLoading, isFetching, refetch } = useEntityLogs(filters);

  const fmtDate = (val?: string) => {
    if (!val) return '—';
    try {
      const d = new Date(val);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(
        d.getHours()
      )}:${p(d.getMinutes())}`;
    } catch {
      return String(val);
    }
  };

  const handleRowClick = (id: string) => {
    const pathMap = {
      order: 'orders',
      product: 'products',
      customer: 'customers',
    };
    router.push(`/dashboard/${pathMap[type]}/${encodeURIComponent(id)}`);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Mini Filters */}
      <div className="flex items-center gap-2">
         <Input 
            placeholder={`Buscar por ${type === 'order' ? 'ID ou Nome' : type === 'product' ? 'SKU' : 'Email'}...`}
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
            className="max-w-xs h-9 bg-background"
         />
         <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9"
          >
            <IconRefresh className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
      </div>

      <div className="text-sm text-muted-foreground flex items-center justify-between">
          <span>
            Total: <strong className="text-foreground">{data?.total ?? 0}</strong> {type === 'order' ? 'pedidos' : type === 'product' ? 'produtos' : 'clientes'}
          </span>
          <span className="text-xs italic opacity-70">Clique para ver todos os logs relacionados</span>
      </div>

      <Card className="relative overflow-hidden border-border/50">
        {isFetching && !isLoading && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center">
            <Spinner />
          </div>
        )}
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{type === 'order' ? 'Pedido' : type === 'product' ? 'Produto' : 'Cliente'}</TableHead>
                <TableHead>Última Sincronização</TableHead>
                <TableHead>Atividades</TableHead>
                <TableHead>Status Global</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-16">
                    <Spinner />
                  </TableCell>
                </TableRow>
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() => handleRowClick(row.id)}
                    className="cursor-pointer group hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="font-medium py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold">{row.name}</span>
                        {type === 'order' && row.name !== row.id && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[10px] font-mono h-5 px-1.5 py-0 bg-background/50 text-muted-foreground border-border/50">
                              Shopify: {row.id}
                            </Badge>
                            {row.wooOrderId && (
                              <Badge variant="outline" className="text-[10px] font-mono h-5 px-1.5 py-0 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                                Woo: {row.wooOrderId}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{fmtDate(row.lastTimestamp)}</TableCell>
                    <TableCell>
                        <Badge variant="secondary" className="font-normal bg-secondary/50">
                            {row.count} ações
                        </Badge>
                    </TableCell>
                    <TableCell>
                        <Badge
                            variant={row.status === 'success' ? 'default' : row.status === 'error' ? 'destructive' : 'secondary'}
                            className={row.status === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 hover:bg-green-500/20' : ''}
                        >
                            {row.status === 'success' ? 'Sincronizado' : row.status === 'error' ? 'Erro' : 'Pulado'}
                        </Badge>
                    </TableCell>
                    <TableCell>
                        <IconChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <IconInbox className="h-8 w-8 opacity-50" />
                      <p>Nenhum registro encontrado</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data && data.pages > 1 && (
        <div className="mt-3">
          <UIPagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious onClick={() => setFilters({ ...filters, page: Math.max(1, filters.page - 1) })} />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink isActive aria-disabled>
                  {filters.page} / {data.pages}
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext onClick={() => setFilters({ ...filters, page: Math.min(data.pages, filters.page + 1) })} />
              </PaginationItem>
            </PaginationContent>
          </UIPagination>
        </div>
      )}
    </div>
  );
}
