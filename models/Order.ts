import mongoose, { Schema, model, type Document, type Model, type Types } from 'mongoose';

export interface OrderDocument extends Document {
  woo_id: number;
  shopify_id?: string;
  order_number?: string;
  status?: string;
  currency?: string;
  total?: string;
  customer_woo_id?: number;
  customer_email?: string;
  customer_ref?: Types.ObjectId;
  billing: Record<string, unknown>;
  shipping: Record<string, unknown>;
  line_items: unknown[];
  raw: Record<string, unknown>;
  raw_shopify?: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const orderSchema = new Schema<OrderDocument>(
  {
    woo_id: { type: Number, required: true, unique: true, index: true },
    shopify_id: { type: String, index: true, sparse: true },
    order_number: { type: String, index: true, sparse: true },
    status: { type: String, index: true },
    currency: { type: String },
    total: { type: String },
    customer_woo_id: { type: Number, index: true },
    customer_email: { type: String, index: true, sparse: true },
    customer_ref: { type: Schema.Types.ObjectId, ref: 'WooCustomer', index: true },
    billing: { type: Schema.Types.Mixed, default: {} },
    shipping: { type: Schema.Types.Mixed, default: {} },
    line_items: { type: [Schema.Types.Mixed], default: [] },
    raw: { type: Schema.Types.Mixed, required: true, default: {} },
    raw_shopify: { type: Schema.Types.Mixed },
    created_at: { type: Date, default: Date.now, index: true },
    updated_at: { type: Date, default: Date.now, index: true },
  },
  { collection: 'orders' }
);

orderSchema.index({ created_at: -1 });
orderSchema.index({ updated_at: -1 });

export const OrderModel =
  (mongoose.models.WooOrder as Model<OrderDocument> | undefined) ||
  model<OrderDocument>('WooOrder', orderSchema);
