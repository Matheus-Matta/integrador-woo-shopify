import { LogEntityDetailPage } from '@/components/dashboard/LogEntityDetailPage';

export default async function OrderLogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LogEntityDetailPage type="order" id={id} />;
}
