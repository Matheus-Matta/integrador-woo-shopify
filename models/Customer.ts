import mongoose, { Schema, model, type Document, type Model } from 'mongoose';

export interface CustomerDocument extends Document {
  woo_id: number;
  shopify_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  phone?: string;
  billing: Record<string, unknown>;
  shipping: Record<string, unknown>;
  raw: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const customerSchema = new Schema<CustomerDocument>(
  {
    woo_id: { type: Number, required: true, unique: true, index: true },
    shopify_id: { type: String, index: true, sparse: true },
    email: { type: String, unique: true, index: true, sparse: true },
    first_name: { type: String },
    last_name: { type: String },
    username: { type: String },
    phone: { type: String, index: true, sparse: true },
    billing: { type: Schema.Types.Mixed, default: {} },
    shipping: { type: Schema.Types.Mixed, default: {} },
    raw: { type: Schema.Types.Mixed, required: true, default: {} },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now, index: true },
  },
  { collection: 'customers' }
);

customerSchema.index({ email: 1 }, { unique: true, sparse: true });
customerSchema.index({ updated_at: -1 });

export const CustomerModel =
  (mongoose.models.WooCustomer as Model<CustomerDocument> | undefined) ||
  model<CustomerDocument>('WooCustomer', customerSchema);
