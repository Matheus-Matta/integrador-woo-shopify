import { LogsEntityTable } from '@/components/dashboard/LogsEntityTable';
import { IconPackage } from '@tabler/icons-react';

export default function ProdutosPage() {
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6 animate-slide-up">
      <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
        <IconPackage className="h-6 w-6 text-primary" />
        Produtos
      </h1>
      <LogsEntityTable type="product" />
    </div>
  );
}

