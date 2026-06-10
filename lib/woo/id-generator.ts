import { CounterModel } from '@/models/Counter';

export async function nextWooId(name: string): Promise<number> {
  const counter = await CounterModel.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return Number(counter?.seq || 1);
}
