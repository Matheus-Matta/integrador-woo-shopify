import { LogEntityDetailPage } from '@/components/dashboard/LogEntityDetailPage';

export default async function CustomerLogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LogEntityDetailPage type="customer" id={id} />;
}
