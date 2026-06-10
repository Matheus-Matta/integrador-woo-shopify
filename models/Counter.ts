import mongoose, { Schema, model, type Model, type Document } from 'mongoose';

export interface CounterDocument extends Document {
  name: string;
  seq: number;
}

const counterSchema = new Schema<CounterDocument>(
  {
    name: { type: String, required: true, unique: true, index: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: 'counters' }
);

export const CounterModel =
  (mongoose.models.Counter as Model<CounterDocument> | undefined) ||
  model<CounterDocument>('Counter', counterSchema);
