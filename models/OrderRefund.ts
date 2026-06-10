import mongoose, { Schema, model, type Document, type Model } from 'mongoose';

export interface OrderRefundDocument extends Document {
  woo_id: number;
  order_woo_id: number;
  raw: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const orderRefundSchema = new Schema<OrderRefundDocument>(
  {
    woo_id: { type: Number, required: true, unique: true, index: true },
    order_woo_id: { type: Number, required: true, index: true },
    raw: { type: Schema.Types.Mixed, required: true, default: {} },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now, index: true },
  },
  { collection: 'order_refunds' }
);

export const OrderRefundModel =
  (mongoose.models.WooOrderRefund as Model<OrderRefundDocument> | undefined) ||
  model<OrderRefundDocument>('WooOrderRefund', orderRefundSchema);
