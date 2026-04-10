import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY fehlt.");
}

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-03-31.basil",
});

export function requireStripeTerminalLocationId() {
  const locationId = process.env.STRIPE_TERMINAL_LOCATION_ID?.trim();

  if (!locationId) {
    throw new Error("STRIPE_TERMINAL_LOCATION_ID fehlt.");
  }

  return locationId;
}

export async function listStripeTerminalReaders() {
  const locationId = requireStripeTerminalLocationId();
  const readers = await stripe.terminal.readers.list({
    location: locationId,
    limit: 100,
  });

  return readers.data;
}
