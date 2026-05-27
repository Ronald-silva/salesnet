/** Apply phone mask: (85) 99999-9999 */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2)  return digits.length ? `(${digits}` : '';
  if (digits.length <= 7)  return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
}

/** Apply CEP mask: 60000-000 */
export function maskCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0,5)}-${digits.slice(5)}`;
}

/** Apply CPF mask: 000.000.000-00 */
export function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3)  return digits;
  if (digits.length <= 6)  return `${digits.slice(0,3)}.${digits.slice(3)}`;
  if (digits.length <= 9)  return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`;
  return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
}

/** Strip all non-digit characters */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}
