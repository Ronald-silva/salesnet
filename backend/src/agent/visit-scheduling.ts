/**
 * Capacidade de agendamento de visitas técnicas.
 *
 * Regra de negócio: 1 vaga por turno (1 manhã + 1 tarde por dia útil). Isso evita
 * empilhar atendimentos no mesmo período e dá folga pra equipe. Quando a equipe
 * termina cedo, o operador antecipa manualmente o próximo cliente (ver
 * `bring-forward-flow.ts`).
 *
 * "Ocupado" = existe uma visita com status `scheduled` para aquele (data, turno).
 * Visitas `cancelled`/`done` liberam a vaga.
 */

import { supabase } from '../config/supabase';

export type VisitPeriod = 'morning' | 'afternoon';

export const VISIT_CAPACITY_PER_PERIOD = 1;

const PERIOD_ORDER: VisitPeriod[] = ['morning', 'afternoon'];

export interface VisitSlot {
  date: string; // YYYY-MM-DD
  period: VisitPeriod;
}

export interface SlotSuggestion extends VisitSlot {
  label: string; // ex.: "quinta-feira (05/06) à tarde"
}

const WEEKDAY_NAMES = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

/** Data de hoje em Fortaleza (UTC-3), formato YYYY-MM-DD. */
export function fortalezaToday(): string {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return now.toISOString().split('T')[0]!;
}

/** Turno atual em Fortaleza: antes das 12h = manhã, senão tarde. */
export function fortalezaCurrentPeriod(): VisitPeriod {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return now.getUTCHours() < 12 ? 'morning' : 'afternoon';
}

export function periodLabelPt(period: VisitPeriod): string {
  return period === 'morning' ? 'manhã (8h-12h)' : 'tarde (14h-18h)';
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0]!;
}

/** Só domingo é folga — a equipe atende de segunda a sábado. */
function isNonWorkingDay(dateIso: string): boolean {
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay() === 0;
}

function slotLabel(slot: VisitSlot): string {
  const date = new Date(`${slot.date}T12:00:00Z`);
  const weekday = WEEKDAY_NAMES[date.getUTCDay()]!;
  const [, m, d] = slot.date.split('-');
  const turno = slot.period === 'morning' ? 'de manhã' : 'à tarde';
  return `${weekday} (${d}/${m}) ${turno}`;
}

/**
 * Verifica se um turno ainda está no futuro (não passou).
 * Fortaleza = UTC-3.
 * - Manhã termina às 12h
 * - Tarde termina às 18h
 */
function isFutureSlot(date: string, period: VisitPeriod): boolean {
  const fortalezaHour = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCHours();
  const todayFortaleza = fortalezaToday();

  if (date > todayFortaleza) return true; // amanhã ou além
  if (date < todayFortaleza) return false; // passado

  // Mesmo dia: manhã termina 12h, tarde termina 18h
  const cutoff = period === 'morning' ? 12 : 18;
  return fortalezaHour < cutoff;
}

/**
 * Conta visitas ativas (status `scheduled`) num intervalo de datas, agrupadas
 * por (data, turno). Uma única query alimenta tanto a checagem de um slot quanto
 * a busca dos próximos livres.
 */
async function loadOccupancy(
  fromDate: string,
  toDate: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('scheduled_visits')
    .select('visit_date, period, status')
    .eq('status', 'scheduled')
    .gte('visit_date', fromDate)
    .lte('visit_date', toDate);

  const occupancy = new Map<string, number>();
  if (error || !data) return occupancy;

  for (const row of data as { visit_date: string; period: string }[]) {
    const key = `${row.visit_date}::${row.period}`;
    occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
  }
  return occupancy;
}

/** Verifica se um turno específico ainda tem vaga. */
export async function isSlotAvailable(date: string, period: VisitPeriod): Promise<boolean> {
  const occupancy = await loadOccupancy(date, date);
  const count = occupancy.get(`${date}::${period}`) ?? 0;
  return count < VISIT_CAPACITY_PER_PERIOD;
}

/**
 * Retorna os próximos turnos livres a partir de `fromDate` (inclusive),
 * pulando domingos (equipe atende seg–sáb). Usado pra Sofia oferecer alternativas.
 */
export async function nextAvailableSlots(
  fromDate: string,
  maxResults = 3,
  horizonDays = 21,
): Promise<SlotSuggestion[]> {
  const toDate = addDays(fromDate, horizonDays);
  const occupancy = await loadOccupancy(fromDate, toDate);

  const suggestions: SlotSuggestion[] = [];
  for (let i = 0; i <= horizonDays && suggestions.length < maxResults; i++) {
    const date = addDays(fromDate, i);
    if (isNonWorkingDay(date)) continue;
    for (const period of PERIOD_ORDER) {
      if (!isFutureSlot(date, period)) continue;
      const count = occupancy.get(`${date}::${period}`) ?? 0;
      if (count < VISIT_CAPACITY_PER_PERIOD) {
        suggestions.push({ date, period, label: slotLabel({ date, period }) });
        if (suggestions.length >= maxResults) break;
      }
    }
  }
  return suggestions;
}
