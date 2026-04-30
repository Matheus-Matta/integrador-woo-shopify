import { LogsEntityTable } from '@/components/dashboard/LogsEntityTable';
import { IconShoppingCart } from '@tabler/icons-react';

export default function PedidosPage() {
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6 animate-slide-up">
      <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
        <IconShoppingCart className="h-6 w-6 text-primary" />
        Pedidos
      </h1>
      <LogsEntityTable type="order" />
    </div>
  );
}

