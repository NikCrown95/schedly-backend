import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

// Paese di default usato per interpretare numeri scritti senza prefisso
// internazionale (es. "333 1234567" → "+393331234567"). Schedly nasce per il
// mercato italiano; se in futuro servirà multi-paese, questo diventa un
// parametro per business invece di una costante globale — il resto del
// codice chiama sempre normalizePhoneToE164(), quindi il cambiamento resta
// isolato qui.
export const DEFAULT_PHONE_COUNTRY: CountryCode = "IT";

// Normalizza un numero di telefono in formato E.164 (es. "+393331234567").
// Ritorna null se il numero non è interpretabile — la chiamata NON deve mai
// lanciare, così un numero scritto male non blocca la creazione del cliente:
// semplicemente non partecipa al matching/deduplica per telefono.
export function normalizePhoneToE164(
  rawPhone: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY
): string | null {
  if (!rawPhone || !rawPhone.trim()) return null;

  const parsed = parsePhoneNumberFromString(rawPhone, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;

  return parsed.number; // già in formato E.164, es. "+393331234567"
}
