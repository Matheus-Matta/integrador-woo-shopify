import { WebhookTable } from '@/components/dashboard/WebhookTable';

export default function WebhooksPage() {
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6 animate-slide-up">
      <WebhookTable />
    </div>
  );
}
