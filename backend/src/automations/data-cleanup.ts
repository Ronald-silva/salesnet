import { supabase } from '../config/supabase';

const BATCH_SIZE = 1000;

function cutoffIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function cutoffHoursIso(hours: number): string {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() - hours);
  return d.toISOString();
}

async function deleteOlderThan(
  table: string,
  timeColumn: string,
  olderThanIso: string,
  selectColumn = 'id',
): Promise<number> {
  let total = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .lt(timeColumn, olderThanIso)
      .select(selectColumn)
      .limit(BATCH_SIZE);

    if (error) {
      console.error(`[data-cleanup] ${table} delete failed:`, error.message);
      break;
    }

    const batch = data?.length ?? 0;
    total += batch;
    if (batch < BATCH_SIZE) break;
  }

  return total;
}

export async function runDataCleanup(): Promise<void> {
  console.log('[data-cleanup] starting retention purge');

  const results: Record<string, number> = {
    processed_message_ids: await deleteOlderThan(
      'processed_message_ids',
      'processed_at',
      cutoffHoursIso(24),
      'message_id',
    ),
    processed_webhook_ids: await deleteOlderThan(
      'processed_webhook_ids',
      'processed_at',
      cutoffHoursIso(24),
      'fingerprint',
    ),
    interaction_logs: await deleteOlderThan(
      'interaction_logs',
      'created_at',
      cutoffIso(90),
    ),
    nps_responses: await deleteOlderThan(
      'nps_responses',
      'created_at',
      cutoffIso(90),
    ),
    billing_notifications: await deleteOlderThan(
      'billing_notifications',
      'sent_at',
      cutoffIso(180),
    ),
  };

  for (const [table, count] of Object.entries(results)) {
    console.log(`[data-cleanup] ${table}: deleted ${count} rows`);
  }

  console.log('[data-cleanup] done (leads, scheduled_visits, sofia_tickets retained — not purged)');
}
