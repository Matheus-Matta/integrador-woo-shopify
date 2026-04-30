import { LogsEntityTable } from '@/components/dashboard/LogsEntityTable';
import { IconUsers } from '@tabler/icons-react';

export default function ClientesPage() {
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6 animate-slide-up">
      <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
        <IconUsers className="h-6 w-6 text-primary" />
        Clientes
      </h1>
      <LogsEntityTable type="customer" />
    </div>
  );
}

