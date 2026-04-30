'use client';

import { useState } from 'react';
import { IconRefresh, IconInbox } from '@tabler/icons-react';
import type { LogRow, LogType, LogsFilters } from '@/types';
import { useLogs } from '@/hooks/useLogs';
import { LogFilters } from './LogFilters';
import { Pagination } from './Pagination';
import { LogDetailModal } from './LogDetailModal';
import { Spinner } from '../ui/Spinner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function StatusBadge({ status }: { status: string }) {
  const isSuccess = status.toLowerCase() === 'sucesso';
  return (
    <Badge
      variant={isSuccess ? 'default' : 'destructive'}
      className={isSuccess ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'}
    >
      {status}
    </Badge>
  );
}

interface LogsTableProps {
  type: LogType;
}

export function LogsTable({ type }: LogsTableProps) {
  const [filters, setFilters] = useState<LogsFilters>({ type, page: 1, limit: 50 });
  const { data, isLoading, isFetching, refetch } = useLogs(filters);
  const [selectedRow, setSelectedRow] = useState<LogRow | null>(null);

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

  const fmtMoney = (v: any) => {
    if (v == null || v === '') return '—';
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  };

  const renderCell = (row: any, colName: string) => {
    switch (colName) {
      case 'order_date':
      case 'customer_date':
      case 'product_date':
      case 'error_date':
        return fmtDate(row.timestamp);
      
      case 'order_id':
        return row.shopify_order_name ?? (row.shopify_order_id ? `#${row.shopify_order_id}` : '—');
      
      case 'order_customer': {
        const b = row.payload?.billing ?? row.webhook?.billing_address ?? {};
        return [b.first_name, b.last_name].filter(Boolean).join(' ') || '—';
      }
      
      case 'order_payment':
        return row.payload?.payment_method_title ?? '—';
      
      case 'customer_name': {
        const p = row.payload ?? {};
        return [p.first_name, p.last_name].filter(Boolean).join(' ') || '—';
      }
      
      case 'customer_email':
        return row.email ?? row.payload?.email ?? '—';
      
      case 'product_sku':
        return row.sku ?? '—';
      
      case 'product_name':
        return row.after?.name ?? row.before?.name ?? '—';
      
      case 'product_detail': {
        if (row.action === 'stock_update') {
          const delta = row.after?.delta;
          const deltaStr = delta != null ? ` (${delta > 0 ? '+' : ''}${delta})` : '';
          return `Estoque: ${row.before?.quantity ?? '?'} → ${row.after?.quantity ?? '?'}${deltaStr}`;
        }
        if (row.action === 'price_update') {
          const price = fmtMoney(row.after?.price);
          const compare = row.after?.compareAtPrice ? ` / De: ${fmtMoney(row.after.compareAtPrice)}` : '';
          return `Preço: ${price}${compare}`;
        }
        if (row.action === 'title_update') return row.after?.name ?? '—';
        return '—';
      }
      
      case 'error_flow':
        return row.flow ?? '—';
      
      case 'error_message':
        return row.error_message ?? '—';
      
      case 'action':
        return row.action ?? '—';
      
      case 'status':
        return <StatusBadge status={row.status ?? 'erro'} />;
        
      default:
        return '—';
    }
  };

  const getCols = () => {
    if (type === 'order') {
      return [
        { key: 'order_date', label: 'Data' },
        { key: 'order_id', label: 'Pedido' },
        { key: 'order_customer', label: 'Cliente' },
        { key: 'order_payment', label: 'Pagamento' },
        { key: 'action', label: 'Ação' },
        { key: 'status', label: 'Status' },
      ];
    }
    if (type === 'customer') {
      return [
        { key: 'customer_date', label: 'Data' },
        { key: 'customer_name', label: 'Nome' },
        { key: 'customer_email', label: 'Email' },
        { key: 'action', label: 'Ação' },
        { key: 'status', label: 'Status' },
      ];
    }
    if (type === 'product') {
      return [
        { key: 'product_date', label: 'Data' },
        { key: 'product_sku', label: 'SKU' },
        { key: 'product_name', label: 'Nome' },
        { key: 'product_detail', label: 'Detalhe' },
        { key: 'action', label: 'Ação' },
        { key: 'status', label: 'Status' },
      ];
    }
    if (type === 'error') {
      return [
        { key: 'error_date', label: 'Data' },
        { key: 'error_flow', label: 'Flow' },
        { key: 'error_message', label: 'Erro' },
        { key: 'status', label: 'Status' },
      ];
    }
    return [];
  };

  const cols = getCols();

  const hasActiveFilters = Boolean(
    filters.search || filters.status || filters.action || filters.from || filters.to
  );

  return (
    <div className="flex flex-col gap-4">
      <LogFilters type={type} filters={filters} onChange={setFilters} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>
            Total: <strong className="text-foreground">{data?.total ?? 0}</strong> registros
          </span>
          {hasActiveFilters && (
            <Badge variant="secondary" className="text-xs">
              filtrado
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(filters.limit)}
            onValueChange={(val) => setFilters({ ...filters, limit: Number(val), page: 1 })}
          >
            <SelectTrigger className="w-[110px] h-9">
              <SelectValue placeholder="Limitar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20 / pág</SelectItem>
              <SelectItem value="50">50 / pág</SelectItem>
              <SelectItem value="100">100 / pág</SelectItem>
            </SelectContent>
          </Select>
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
              <TableRow>
                {cols.map((col) => (
                  <TableHead key={col.key}>
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={cols.length} className="text-center py-16">
                    <Spinner />
                  </TableCell>
                </TableRow>
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((row, idx) => (
                  <TableRow
                    key={row._id || idx}
                    onClick={() => setSelectedRow(row)}
                    className="cursor-pointer group"
                    title="Clique para ver detalhes do JSON"
                  >
                    {cols.map((col) => (
                      <TableCell key={col.key} className="py-3 max-w-[200px] truncate">
                        {renderCell(row, col.key)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={cols.length} className="text-center py-16 text-muted-foreground">
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
        <Pagination
          page={filters.page}
          pages={data.pages}
          onPageChange={(page) => setFilters({ ...filters, page })}
        />
      )}

      {selectedRow && (
        <LogDetailModal row={selectedRow} type={type} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  );
}

