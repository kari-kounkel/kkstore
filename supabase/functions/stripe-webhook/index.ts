// Stripe webhook for the kkstore shop.
// On a completed one-time checkout it: records the order, then notifies Kari
// by EMAIL (Resend) and TEXT (Twilio). Degrades gracefully — if a provider's
// secrets aren't set yet, it skips that channel but still records the order.
//
// Register this function's URL as a Stripe webhook endpoint (event:
// checkout.session.completed) and set STRIPE_WEBHOOK_SECRET.
//
// Supabase secrets used:
//   STRIPE_SECRET_KEY            (already set — shared with create-checkout)
//   STRIPE_WEBHOOK_SECRET        whsec_... from the Stripe webhook you create
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (already set)
//   RESEND_API_KEY               re_...   (email)
//   ORDER_EMAIL_TO               where to email you (default kari@karikounkel.com)
//   ORDER_EMAIL_FROM             verified sender (default onboarding@resend.dev)
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, TWILIO_TO   (SMS)

import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function money(cents: number | null, cur = "usd") {
  if (cents == null) return "";
  return "$" + (cents / 100).toFixed(2) + (cur && cur !== "usd" ? " " + cur.toUpperCase() : "");
}

async function sendEmail(subject: string, text: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) { console.log("RESEND_API_KEY not set — skipping email"); return; }
  const to = Deno.env.get("ORDER_EMAIL_TO") || "kari@karikounkel.com";
  const from = Deno.env.get("ORDER_EMAIL_FROM") || "Fast Camel Press <onboarding@resend.dev>";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!r.ok) console.error("Resend failed:", r.status, await r.text());
}

async function sendSms(body: string) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM");
  const to = Deno.env.get("TWILIO_TO");
  if (!sid || !token || !from || !to) { console.log("Twilio secrets incomplete — skipping SMS"); return; }
  const form = new URLSearchParams({ From: from, To: to, Body: body });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${sid}:${token}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!r.ok) console.error("Twilio failed:", r.status, await r.text());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    if (!sig || !secret) throw new Error("missing signature or STRIPE_WEBHOOK_SECRET");
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, secret);
  } catch (err) {
    console.error("Signature verification failed:", (err as Error).message);
    return new Response("Bad signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true, ignored: event.type }), { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  // Store orders are one-time payments; skip subscriptions (cares-works handles those).
  if (session.mode === "subscription" || session.subscription) {
    return new Response(JSON.stringify({ received: true, skipped: "subscription" }), { status: 200 });
  }

  // Idempotency: skip if we already recorded this session.
  const { data: existing } = await supabase.from("orders").select("id").eq("stripe_session_id", session.id).maybeSingle();
  if (existing) return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });

  // Pull line items.
  let lines: { name: string; qty: number; amount: number }[] = [];
  try {
    const li = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
    lines = li.data.map((l) => ({
      name: l.description || "item",
      qty: l.quantity || 1,
      amount: l.amount_total ?? 0,
    }));
  } catch (err) {
    console.error("listLineItems failed:", (err as Error).message);
  }

  const shipping = (session as any).shipping_details || (session as any).customer_details?.address
    ? { name: (session as any).shipping_details?.name || session.customer_details?.name,
        address: (session as any).shipping_details?.address || session.customer_details?.address }
    : null;
  const hasPhysical = !!(session as any).shipping_details || !!(session.shipping_cost);

  const record = {
    stripe_session_id: session.id,
    email: session.customer_details?.email ?? null,
    name: session.customer_details?.name ?? null,
    amount_total: session.amount_total ?? null,
    currency: session.currency ?? "usd",
    items: lines,
    shipping,
    has_physical: hasPhysical,
  };
  const { error: insErr } = await supabase.from("orders").insert(record);
  if (insErr) console.error("orders insert failed:", insErr.message);

  // Build the alert.
  const itemLines = lines.map((l) => `• ${l.qty}× ${l.name} — ${money(l.amount, record.currency)}`).join("\n");
  const shipStr = shipping?.address
    ? `\nShip to: ${shipping.name || ""}\n${shipping.address.line1 || ""}${shipping.address.line2 ? " " + shipping.address.line2 : ""}\n${shipping.address.city || ""}, ${shipping.address.state || ""} ${shipping.address.postal_code || ""}`
    : "";
  const total = money(record.amount_total, record.currency);
  const buyer = record.name || record.email || "a customer";

  const emailBody = `You got an order! 🥚\n\n${itemLines}\n\nTotal: ${total}\nBuyer: ${buyer}${record.email ? " (" + record.email + ")" : ""}${shipStr}\n\n${hasPhysical ? "This needs shipping." : "Digital — nothing to ship."}\n\nStripe: https://dashboard.stripe.com/payments`;
  const smsBody = `🥚 New order — ${total}: ${lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}. ${hasPhysical ? "Ship it." : "Digital."} From ${buyer}.`;

  try { await sendEmail(`New order: ${total} — ${lines.map((l) => l.name).join(", ")}`, emailBody); } catch (e) { console.error("email err", e); }
  try { await sendSms(smsBody); } catch (e) { console.error("sms err", e); }

  await supabase.from("orders").update({ notified: true }).eq("stripe_session_id", session.id);

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
