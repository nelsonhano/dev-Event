import { Schema, model, models, Document, Model } from 'mongoose';

// Moderation audit trail (spec 0001, AC-20). Insert only: the app never updates or
// deletes entries, and they are kept indefinitely.

export const AUDIT_ACTIONS = ['role.grant', 'role.revoke', 'user.ban', 'user.unban', 'event.update', 'event.delete'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface IAuditLog extends Document {
  actorId: string;
  actorEmail: string;
  action: AuditAction;
  targetType: 'user' | 'event';
  targetId: string;
  /** Email or title copied at the time, so the entry still reads well after renames or deletes. */
  targetLabel: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: String, required: true },
    actorEmail: { type: String, required: true },
    action: { type: String, required: true, enum: AUDIT_ACTIONS },
    targetType: { type: String, required: true, enum: ['user', 'event'] },
    targetId: { type: String, required: true },
    targetLabel: { type: String, required: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AuditLogSchema.index({ createdAt: -1 });

const AuditLog: Model<IAuditLog> = (models.AuditLog as Model<IAuditLog>) || model<IAuditLog>('AuditLog', AuditLogSchema);

export default AuditLog;
