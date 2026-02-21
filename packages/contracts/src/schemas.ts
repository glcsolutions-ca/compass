import { z } from "zod";

export const SourceSystemStatusSchema = z.enum(["healthy", "degraded", "unavailable"]);

export const SourceSystemSnapshotSchema = z.object({
  name: z.string().min(1),
  status: SourceSystemStatusSchema,
  lastSyncedAt: z.string().datetime()
});

export const TimeEntrySchema = z.object({
  id: z.string().min(1),
  sourceSystem: z.string().min(1),
  workPackageId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date"),
  hours: z.number().gt(0),
  lastUpdatedAt: z.string().datetime()
});

export const WorkPackageSchema = z.object({
  id: z.string().min(1),
  sourceSystem: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["assigned", "active", "blocked", "closed"]),
  assignedAt: z.string().datetime(),
  lastUpdatedAt: z.string().datetime()
});

export const ConsolidatedEmployeeViewSchema = z.object({
  employeeId: z.string().min(1),
  asOf: z.string().datetime(),
  freshnessLagSeconds: z.number().int().nonnegative(),
  sourceSystems: z.array(SourceSystemSnapshotSchema),
  timeEntries: z.array(TimeEntrySchema),
  workPackages: z.array(WorkPackageSchema)
});

export const ConsolidatedEmployeeViewParamsSchema = z.object({
  employeeId: z.string().min(1)
});

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
});

export type SourceSystemStatus = z.infer<typeof SourceSystemStatusSchema>;
export type SourceSystemSnapshot = z.infer<typeof SourceSystemSnapshotSchema>;
export type TimeEntry = z.infer<typeof TimeEntrySchema>;
export type WorkPackage = z.infer<typeof WorkPackageSchema>;
export type ConsolidatedEmployeeView = z.infer<typeof ConsolidatedEmployeeViewSchema>;
export type ConsolidatedEmployeeViewParams = z.infer<typeof ConsolidatedEmployeeViewParamsSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
