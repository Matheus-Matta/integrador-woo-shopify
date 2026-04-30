import { LogsTable } from '@/components/dashboard/LogsTable';
import { IconAlertTriangle } from '@tabler/icons-react';

export default function ErrosPage() {
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6 animate-slide-up">
      <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
        <IconAlertTriangle className="h-6 w-6 text-destructive" />
        Erros
      </h1>
      <LogsTable type="error" />
    </div>
  );
}
