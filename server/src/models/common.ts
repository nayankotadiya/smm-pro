import { Schema } from 'mongoose';
export const ObjectId = Schema.Types.ObjectId;
export const ts = { timestamps: true } as const;
/** Soft delete helper: all queries on these schemas exclude deleted docs unless includeDeleted is set */
export function softDelete(schema: Schema) {
  schema.add({ deletedAt: { type: Date, default: null } });
  const hide = function (this: any) {
    if (!this.getOptions().includeDeleted && this.getFilter().deletedAt === undefined) this.where({ deletedAt: null });
  };
  schema.pre(['find', 'findOne', 'countDocuments', 'findOneAndUpdate'] as any, hide);
}
