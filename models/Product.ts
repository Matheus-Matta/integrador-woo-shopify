import mongoose, { Schema, model, type Document, type Model } from 'mongoose';

export interface ProductDocument extends Document {
  woo_id: number;
  shopify_id?: string;
  sku?: string;
  slug?: string;
  name?: string;
  status?: string;
  type?: string;
  raw: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const productSchema = new Schema<ProductDocument>(
  {
    woo_id: { type: Number, required: true, unique: true, index: true },
    shopify_id: { type: String, index: true, sparse: true },
    sku: { type: String, index: true, sparse: true },
    slug: { type: String, index: true, sparse: true },
    name: { type: String },
    status: { type: String, index: true },
    type: { type: String, index: true },
    raw: { type: Schema.Types.Mixed, required: true, default: {} },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now, index: true },
  },
  { collection: 'products' }
);

productSchema.index({ sku: 1 }, { sparse: true });
productSchema.index({ slug: 1 }, { sparse: true });
productSchema.index({ shopify_id: 1 }, { sparse: true });
productSchema.index({ status: 1 });
productSchema.index({ type: 1 });
productSchema.index({ updated_at: -1 });

export const ProductModel =
  (mongoose.models.WooProduct as Model<ProductDocument> | undefined) ||
  model<ProductDocument>('WooProduct', productSchema);
