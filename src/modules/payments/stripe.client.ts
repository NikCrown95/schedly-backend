import Stripe from "stripe";
import { env } from "@config/env.js";

// In sviluppo locale senza chiave Stripe configurata, l'istanza viene comunque
// creata (Stripe non valida la chiave finché non si effettua una chiamata reale)
// così il resto del codice non deve gestire un "client opzionale".
export const stripe = new Stripe(env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2024-06-20",
});
