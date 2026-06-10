import mongoose, { Schema, model, type Document, type Model } from 'mongoose';

export interface CategoryDocument extends Document {
  woo_id: number;
  slug?: string;
  name?: string;
  raw: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const categorySchema = new Schema<CategoryDocument>(
  {
    woo_id: { type: Number, required: true, unique: true, index: true },
    slug: { type: String, index: true, sparse: true },
    name: { type: String },
    raw: { type: Schema.Types.Mixed, required: true, default: {} },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now, index: true },
  },
  { collection: 'categories' }
);

export const CategoryModel =
  (mongoose.models.WooCategory as Model<CategoryDocument> | undefined) ||
  model<CategoryDocument>('WooCategory', categorySchema);
