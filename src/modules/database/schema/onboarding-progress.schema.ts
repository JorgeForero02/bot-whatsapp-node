import { mysqlTable, int, varchar, boolean, timestamp, uniqueIndex } from 'drizzle-orm/mysql-core';

export const onboardingProgress = mysqlTable(
  'onboarding_progress',
  {
    id: int('id').primaryKey().autoincrement(),
    stepName: varchar('step_name', { length: 100 }).notNull(),
    stepOrder: int('step_order').notNull(),
    isCompleted: boolean('is_completed').default(false),
    isSkipped: boolean('is_skipped').default(false),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    uniqueIndex('unique_step_name').on(table.stepName),
  ],
);
