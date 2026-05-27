import { supabase } from '../config/supabase';
import { env } from '../config/env';

const COST_PER_MILLION_USD: Record<string, { input: number; output: number }> = {
  anthropic: { input: 3, output: 15 },
  deepseek: { input: 0.27, output: 1.1 },
};

function estimateUsd(provider: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_MILLION_USD[provider] ?? COST_PER_MILLION_USD.anthropic;
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}

export async function warnIfDailyBudgetExceeded(): Promise<void> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('interaction_logs')
    .select('input_tokens, output_tokens, llm_provider')
    .gte('created_at', startOfDay.toISOString())
    .not('input_tokens', 'is', null);

  if (error) {
    console.warn('[llm-budget] failed to query daily usage:', error.message);
    return;
  }

  let totalUsd = 0;
  for (const row of data ?? []) {
    const input = row.input_tokens ?? 0;
    const output = row.output_tokens ?? 0;
    const provider = row.llm_provider ?? 'anthropic';
    totalUsd += estimateUsd(provider, input, output);
  }

  if (totalUsd > env.LLM_DAILY_BUDGET_USD) {
    console.warn(
      `[llm-budget] daily LLM spend estimate $${totalUsd.toFixed(4)} exceeds budget $${env.LLM_DAILY_BUDGET_USD}`,
    );
  }
}
