import { LogEntityDetailPage } from '@/components/dashboard/LogEntityDetailPage';

export default async function ProductLogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LogEntityDetailPage type="product" id={id} />;
}
