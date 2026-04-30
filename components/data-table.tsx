"use client"

import * as React from "react"
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconAlertTriangleFilled,
  IconDotsVertical,
  IconLayoutColumns,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import { useLogs } from "@/hooks/useLogs"
import type { LogRow, LogType } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

export function DataTable() {
  const [logType, setLogType] = React.useState<LogType>("order")
  const [page, setPage] = React.useState(1)
  const limit = 10

  const { data, isLoading, isFetching, refetch } = useLogs({
    type: logType,
    page,
    limit,
  })

  const columns = React.useMemo<ColumnDef<LogRow>[]>(() => {
    const base: ColumnDef<LogRow>[] = [
      {
        accessorKey: "timestamp",
        header: "Data/Hora",
        cell: ({ row }) => (
          <span className="text-muted-foreground whitespace-nowrap">
            {format(new Date(row.original.timestamp), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
          </span>
        ),
      },
      {
        accessorKey: "action",
        header: "Ação/Fluxo",
        cell: ({ row }) => {
          const action = (row.original as any).action || (row.original as any).flow || "-"
          return <span className="font-medium">{action}</span>
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          if (logType === "error") return <Badge variant="outline" className="border-red-500/50 text-red-500 gap-1"><IconCircleXFilled size={14} /> Erro</Badge>

          const status = (row.original as any).status
          if (status === "success") return <Badge variant="outline" className="border-green-500/50 text-green-500 gap-1"><IconCircleCheckFilled size={14} /> Sucesso</Badge>
          if (status === "error") return <Badge variant="outline" className="border-red-500/50 text-red-500 gap-1"><IconCircleXFilled size={14} /> Erro</Badge>
          if (status === "skipped") return <Badge variant="outline" className="border-yellow-500/50 text-yellow-500 gap-1"><IconAlertTriangleFilled size={14} /> Pulado</Badge>
          return <Badge variant="outline">{status || "-"}</Badge>
        },
      },
    ]

    // Colunas específicas por tipo
    if (logType === "order") {
      base.push({
        accessorKey: "shopify_order_name",
        header: "Pedido",
        cell: ({ row }) => (row.original as any).shopify_order_name || (row.original as any).shopify_order_id || "-",
      })
    } else if (logType === "customer") {
      base.push({
        accessorKey: "email",
        header: "Cliente",
        cell: ({ row }) => (row.original as any).email || "-",
      })
    } else if (logType === "product") {
      base.push({
        accessorKey: "sku",
        header: "SKU",
        cell: ({ row }) => (row.original as any).sku || "-",
      })
    } else if (logType === "error") {
      base.push({
        accessorKey: "error_message",
        header: "Mensagem de Erro",
        cell: ({ row }) => (
          <span className="text-red-400 line-clamp-1 max-w-md">
            {(row.original as any).error_message}
          </span>
        ),
      })
    }

    return base
  }, [logType])

  const table = useReactTable({
    data: data?.data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <Tabs
          value={logType}
          onValueChange={(v) => {
            setLogType(v as LogType)
            setPage(1)
          }}
          className="w-fit"
        >
          <TabsList>
            <TabsTrigger value="order">Pedidos</TabsTrigger>
            <TabsTrigger value="product">Produtos</TabsTrigger>
            <TabsTrigger value="customer">Clientes</TabsTrigger>
            <TabsTrigger value="error">Erros</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <IconRefresh className={isFetching ? "animate-spin" : ""} />
            Atualizar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm">
                  <IconLayoutColumns />
                  Colunas
                  <IconChevronDown />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        <div className="rounded-md border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <IconLoader2 className="animate-spin text-primary" />
                      Carregando logs...
                    </div>
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                    Nenhum log encontrado para este filtro.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginação Simplificada */}
        <div className="flex items-center justify-between py-4">
          <div className="text-sm text-muted-foreground">
            Total: {data?.total || 0} logs
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(1)}
              disabled={page === 1}
            >
              <IconChevronsLeft size={16} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
            >
              <IconChevronLeft size={16} />
            </Button>
            <span className="text-sm font-medium px-2">
              Página {page} de {data?.pages || 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= (data?.pages || 1)}
            >
              <IconChevronRight size={16} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(data?.pages || 1)}
              disabled={page >= (data?.pages || 1)}
            >
              <IconChevronsRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
