export interface UrgencyFactors {
  isHumanMode: boolean;
  invoiceDaysOverdue: number;
  isChurnRisk: boolean;
  hasOpenTicket: boolean;
  minutesSinceLastMessage: number;
  sessionMode: string;
  npsScore: number | null;
}

export function calculateUrgencyScore(f: UrgencyFactors): number {
  let score = 0;

  if (f.isHumanMode) score += 100;

  if (f.invoiceDaysOverdue >= 5) score += 80;
  else if (f.invoiceDaysOverdue >= 3) score += 50;
  else if (f.invoiceDaysOverdue >= 1) score += 20;

  if (f.isChurnRisk) score += 60;
  if (f.npsScore !== null && f.npsScore <= 2) score += 40;
  if (f.hasOpenTicket) score += 30;

  const modeScore: Record<string, number> = {
    billing: 25, support: 20, commercial: 10, prospect: 5, default: 0,
  };
  score += modeScore[f.sessionMode] ?? 0;

  if (f.isHumanMode && f.minutesSinceLastMessage > 10) score += 30;
  if (f.isHumanMode && f.minutesSinceLastMessage > 30) score += 30;

  return score;
}

export function urgencyReasons(f: UrgencyFactors): string[] {
  const reasons: string[] = [];
  if (f.isHumanMode) reasons.push('Aguardando sua resposta');
  if (f.invoiceDaysOverdue >= 3) reasons.push(`Fatura ${f.invoiceDaysOverdue}d em atraso`);
  if (f.isChurnRisk) reasons.push('Risco de cancelamento');
  if (f.npsScore !== null && f.npsScore <= 2) reasons.push('NPS crítico recente');
  if (f.hasOpenTicket) reasons.push('Chamado técnico aberto');
  if (f.isHumanMode && f.minutesSinceLastMessage > 10) {
    reasons.push(`Esperando ${f.minutesSinceLastMessage}min`);
  }
  return reasons;
}
