// ============================================================
// K Co Register — the whole POS backend, one function.
//
// The iPad never sees a Stripe key. It sends an action plus a passcode;
// everything that matters happens here with the service role.
//
// Supabase secrets used:
//   STRIPE_SECRET_KEY           sk_live_... / sk_test_...  (already set for the store)
//   POS_ACCESS_CODE             the passcode you type on the iPad
//   POS_READER_ID               tmr_...  the smart reader (optional until you own one)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (set for you by Supabase)
//   POS_ORIGIN                  optional, for the QR-fallback return URL
// ============================================================

import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pos-code",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2024-06-20" }) : null;

/** Length-independent compare so the passcode can't be guessed a character at a time. */
function codeOk(given: string | null): boolean {
  const want = Deno.env.get("POS_ACCESS_CODE");
  if (!want) return false;              // no code configured == locked, not open
  if (!given) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(want);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

const money = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const cents = (n: unknown) => Math.round((Number(n) || 0) * 100);

/**
 * Prices come from the database, never from the iPad.
 * The client sends item ids and quantities; we look up what they actually cost.
 */
async function priceCart(eventId: string, cart: any[], discount: number) {
  const { data: ev } = await db.from("pos_events").select("*").eq("id", eventId).single();
  if (!ev) throw new Error("That event no longer exists.");

  const ids = cart.filter((l) => l.item_id).map((l) => l.item_id);
  const { data: items } = ids.length
    ? await db.from("pos_event_items").select("*").in("id", ids)
    : { data: [] as any[] };

  const lines: any[] = [];
  let subtotal = 0, taxable = 0;

  for (const l of cart) {
    const qty = Math.max(1, Math.min(999, parseInt(l.qty) || 1));
    let label: string, unit: number, isTaxable: boolean, productId: string | null = null;

    if (l.item_id) {
      const it = (items || []).find((x: any) => x.id === l.item_id);
      if (!it) continue;
      label = it.label; unit = money(it.price); isTaxable = it.taxable; productId = it.product_id;
    } else {
      // Custom amount. The one place a price legitimately comes from the iPad.
      unit = money(l.unit_price);
      if (!(unit > 0)) continue;
      label = String(l.label || "Custom amount").slice(0, 120);
      isTaxable = l.taxable !== false;
    }

    const lineTotal = money(unit * qty);
    subtotal += lineTotal;
    if (isTaxable) taxable += lineTotal;
    lines.push({ item_id: l.item_id || null, product_id: productId, label, unit_price: unit, qty, taxable: isTaxable });
  }

  if (!lines.length) throw new Error("The cart is empty.");

  // A discount comes off the whole sale, so it comes off the taxable share proportionally.
  const disc = Math.min(money(discount), subtotal);
  const taxableAfter = subtotal > 0 ? taxable * (1 - disc / subtotal) : 0;
  const tax = money(taxableAfter * Number(ev.tax_rate || 0));
  const total = money(subtotal - disc + tax);

  if (total <= 0) throw new Error("That comes to zero — take it as a gift instead of a sale.");
  return { ev, lines, subtotal: money(subtotal), discount: disc, tax, total };
}

/** Create the sale plus its lines, or hand back the one this cart already created. */
async function openSale(eventId: string, clientRef: string, tender: string, priced: any, email: string | null) {
  const existing = await db.from("pos_sales").select("*").eq("client_ref", clientRef).maybeSingle();
  if (existing.data) return { sale: existing.data, fresh: false };

  const { data: sale, error } = await db.from("pos_sales").insert({
    event_id: eventId, client_ref: clientRef, tender,
    subtotal: priced.subtotal, discount: priced.discount, tax: priced.tax, total: priced.total,
    customer_email: email || null, status: "pending",
  }).select().single();

  // Lost a race with another tap — the other one wins.
  if (error) {
    const again = await db.from("pos_sales").select("*").eq("client_ref", clientRef).maybeSingle();
    if (again.data) return { sale: again.data, fresh: false };
    throw new Error(error.message);
  }

  await db.from("pos_sale_lines").insert(priced.lines.map((l: any) => ({ ...l, sale_id: sale.id })));
  return { sale, fresh: true };
}

const paidPatch = (extra: Record<string, unknown> = {}) => ({ status: "paid", paid_at: new Date().toISOString(), ...extra });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const action = String(body.action || "");

  // Everything past this line requires the passcode.
  if (!codeOk(req.headers.get("x-pos-code"))) {
    return json({ error: "Wrong passcode." }, 401);
  }

  try {
    switch (action) {

      // ---------- register startup ----------
      case "bootstrap": {
        const { data: ev } = await db.from("pos_events").select("*").eq("active", true).maybeSingle();
        if (!ev) return json({ event: null, items: [] });
        const { data: items } = await db.from("pos_event_items")
          .select("*").eq("event_id", ev.id).order("sort_order").order("label");
        return json({ event: ev, items: items || [], reader_configured: !!Deno.env.get("POS_READER_ID") });
      }

      // ---------- admin: events ----------
      case "events.list": {
        const { data } = await db.from("pos_events").select("*").order("created_at", { ascending: false });
        return json({ events: data || [] });
      }
      case "events.create": {
        const { data, error } = await db.from("pos_events").insert({
          name: String(body.name || "Untitled event").slice(0, 120),
          event_date: body.event_date || null,
          location: body.location || null,
          tax_rate: Number(body.tax_rate) || 0,
        }).select().single();
        if (error) throw new Error(error.message);
        return json({ event: data });
      }
      case "events.update": {
        const patch: any = {};
        for (const k of ["name", "event_date", "location", "tax_rate", "notes"]) {
          if (k in body) patch[k] = body[k] === "" ? null : body[k];
        }
        if ("tax_rate" in patch) patch.tax_rate = Number(patch.tax_rate) || 0;
        const { data, error } = await db.from("pos_events").update(patch).eq("id", body.event_id).select().single();
        if (error) throw new Error(error.message);
        return json({ event: data });
      }
      case "events.activate": {
        // The unique index allows one active row, so clear first, then set.
        await db.from("pos_events").update({ active: false }).eq("active", true);
        const { data, error } = await db.from("pos_events")
          .update({ active: true, closed_at: null }).eq("id", body.event_id).select().single();
        if (error) throw new Error(error.message);
        return json({ event: data });
      }
      case "events.close": {
        const { data, error } = await db.from("pos_events")
          .update({ active: false, closed_at: new Date().toISOString() })
          .eq("id", body.event_id).select().single();
        if (error) throw new Error(error.message);
        return json({ event: data });
      }

      // ---------- admin: the buttons ----------
      case "catalog": {
        const { data } = await db.from("products")
          .select("id,title,price,status,product_type,categories")
          .in("status", ["live", "preorder", "coming_soon"])
          .order("title");
        return json({ products: data || [] });
      }
      case "items.load": {
        const { data } = await db.from("pos_event_items")
          .select("*").eq("event_id", body.event_id).order("sort_order").order("label");
        return json({ items: data || [] });
      }
      case "items.save": {
        // Whole-list replace. Simplest thing that keeps order and edits honest.
        const eventId = body.event_id;
        const rows = (body.items || []).map((it: any, i: number) => ({
          event_id: eventId,
          product_id: it.product_id || null,
          label: String(it.label || "Item").slice(0, 120),
          price: money(it.price),
          taxable: it.taxable !== false,
          stock_qty: it.stock_qty === "" || it.stock_qty == null ? null : parseInt(it.stock_qty),
          sort_order: i,
        }));
        await db.from("pos_event_items").delete().eq("event_id", eventId);
        if (rows.length) {
          const { error } = await db.from("pos_event_items").insert(rows);
          if (error) throw new Error(error.message);
        }
        const { data } = await db.from("pos_event_items").select("*").eq("event_id", eventId).order("sort_order");
        return json({ items: data || [] });
      }

      // ---------- selling: cash ----------
      case "sale.cash": {
        const priced = await priceCart(body.event_id, body.cart || [], body.discount || 0);
        const { sale, fresh } = await openSale(body.event_id, body.client_ref, "cash", priced, body.customer_email);
        if (!fresh && sale.status === "paid") return json({ sale, already: true });

        const received = body.cash_received == null ? null : money(body.cash_received);
        const { data } = await db.from("pos_sales").update(paidPatch({
          cash_received: received,
          change_due: received == null ? null : money(Math.max(0, received - sale.total)),
        })).eq("id", sale.id).select().single();
        return json({ sale: data });
      }

      // ---------- selling: card on the reader ----------
      case "sale.card": {
        if (!stripe) return json({ error: "Stripe isn't configured yet." }, 500);
        const readerId = Deno.env.get("POS_READER_ID");
        if (!readerId) return json({ error: "No reader configured. Set POS_READER_ID, or take cash / use the QR code." }, 400);

        const priced = await priceCart(body.event_id, body.cart || [], body.discount || 0);
        const { sale } = await openSale(body.event_id, body.client_ref, "card", priced, body.customer_email);
        if (sale.status === "paid") return json({ sale, already: true });

        // Reuse the PaymentIntent if this cart already made one. Never create a second.
        let piId = sale.stripe_payment_intent;
        if (!piId) {
          const pi = await stripe.paymentIntents.create({
            amount: cents(priced.total),
            currency: "usd",
            payment_method_types: ["card_present"],
            capture_method: "automatic",
            description: priced.ev.name + " — K Co Register",
            ...(sale.customer_email ? { receipt_email: sale.customer_email } : {}),
            metadata: {
              source: "pos",
              channel: "in_person",
              event_id: priced.ev.id,
              event_name: priced.ev.name,
              sale_id: sale.id,
            },
          }, { idempotencyKey: "pos_pi_" + sale.client_ref });
          piId = pi.id;
          await db.from("pos_sales").update({ stripe_payment_intent: piId, stripe_reader: readerId, status: "processing" }).eq("id", sale.id);
        }

        try {
          await stripe.terminal.readers.processPaymentIntent(readerId, { payment_intent: piId });
        } catch (e) {
          const msg = (e as Error).message || "";
          // "in progress" means the reader is already showing this charge. Not an error.
          if (!/in progress|already/i.test(msg)) {
            await db.from("pos_sales").update({ status: "failed", failure_reason: msg }).eq("id", sale.id);
            return json({ error: msg }, 400);
          }
        }
        return json({ sale_id: sale.id, payment_intent: piId, total: priced.total, status: "processing" });
      }

      // ---------- selling: poll until the reader answers ----------
      case "sale.status": {
        const { data: sale } = await db.from("pos_sales").select("*").eq("id", body.sale_id).single();
        if (!sale) return json({ error: "Unknown sale" }, 404);
        if (sale.status === "paid" || sale.status === "failed" || sale.status === "canceled") return json({ sale });
        if (!stripe || !sale.stripe_payment_intent) return json({ sale });

        const pi = await stripe.paymentIntents.retrieve(sale.stripe_payment_intent);
        if (pi.status === "succeeded") {
          const { data } = await db.from("pos_sales").update(paidPatch()).eq("id", sale.id).select().single();
          return json({ sale: data });
        }
        if (pi.status === "canceled") {
          const { data } = await db.from("pos_sales").update({ status: "canceled" }).eq("id", sale.id).select().single();
          return json({ sale: data });
        }

        // Still waiting — surface why, if the reader said.
        let reason: string | null = null;
        try {
          const reader = await stripe.terminal.readers.retrieve(sale.stripe_reader!);
          const act: any = (reader as any).action;
          if (act?.status === "failed") reason = act.failure_message || "The card was declined.";
        } catch { /* reader unreachable; keep waiting */ }

        if (reason) {
          const { data } = await db.from("pos_sales").update({ status: "failed", failure_reason: reason }).eq("id", sale.id).select().single();
          return json({ sale: data });
        }
        return json({ sale });
      }

      case "sale.cancel": {
        const { data: sale } = await db.from("pos_sales").select("*").eq("id", body.sale_id).single();
        if (!sale) return json({ error: "Unknown sale" }, 404);
        if (sale.status === "paid") return json({ error: "That one already went through — refund it in Stripe instead.", sale }, 409);
        if (stripe && sale.stripe_reader) { try { await stripe.terminal.readers.cancelAction(sale.stripe_reader); } catch { /* nothing to cancel */ } }
        if (stripe && sale.stripe_payment_intent) { try { await stripe.paymentIntents.cancel(sale.stripe_payment_intent); } catch { /* already gone */ } }
        const { data } = await db.from("pos_sales").update({ status: "canceled" }).eq("id", sale.id).select().single();
        return json({ sale: data });
      }

      // ---------- fallback: customer pays on their own phone ----------
      case "sale.link": {
        if (!stripe) return json({ error: "Stripe isn't configured yet." }, 500);
        const priced = await priceCart(body.event_id, body.cart || [], body.discount || 0);
        const { sale } = await openSale(body.event_id, body.client_ref, "link", priced, body.customer_email);
        if (sale.status === "paid") return json({ sale, already: true });

        const origin = Deno.env.get("POS_ORIGIN") || "https://karikounkel.shop";
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          line_items: [{
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: cents(priced.total),
              product_data: { name: priced.ev.name + " — in person" },
            },
          }],
          ...(sale.customer_email ? { customer_email: sale.customer_email } : {}),
          success_url: origin + "/pos/?paid=1",
          cancel_url: origin + "/pos/?canceled=1",
          metadata: { source: "pos", channel: "in_person_link", event_id: priced.ev.id, event_name: priced.ev.name, sale_id: sale.id },
          payment_intent_data: {
            metadata: { source: "pos", channel: "in_person_link", event_id: priced.ev.id, event_name: priced.ev.name, sale_id: sale.id },
          },
        }, { idempotencyKey: "pos_cs_" + sale.client_ref });

        await db.from("pos_sales").update({ status: "processing", stripe_payment_intent: (session.payment_intent as string) || null }).eq("id", sale.id);
        return json({ sale_id: sale.id, url: session.url, total: priced.total });
      }

      // Kari confirms by eye that the phone paid. Keeps the register moving.
      case "sale.link.confirm": {
        const { data } = await db.from("pos_sales").update(paidPatch()).eq("id", body.sale_id).select().single();
        return json({ sale: data });
      }

      // ---------- receipts ----------
      case "sale.receipt": {
        const email = String(body.email || "").trim();
        if (!email) return json({ error: "No email given." }, 400);
        const { data: sale } = await db.from("pos_sales").select("*").eq("id", body.sale_id).single();
        if (!sale) return json({ error: "Unknown sale" }, 404);
        await db.from("pos_sales").update({ customer_email: email }).eq("id", sale.id);
        // Stripe emails its own receipt the moment receipt_email is set on a succeeded charge.
        if (stripe && sale.stripe_payment_intent) {
          await stripe.paymentIntents.update(sale.stripe_payment_intent, { receipt_email: email });
          return json({ ok: true, emailed: true });
        }
        // Cash sale — nothing for Stripe to send. Recorded against the sale.
        return json({ ok: true, emailed: false, note: "Saved to the sale. Cash sales have no Stripe receipt to send." });
      }

      // ---------- reporting ----------
      case "report": {
        const eventId = body.event_id;
        const { data: totals } = await db.from("pos_event_totals").select("*").eq("event_id", eventId).maybeSingle();
        const { data: sales } = await db.from("pos_sales")
          .select("*").eq("event_id", eventId).order("created_at", { ascending: false }).limit(200);
        const { data: lines } = await db.from("pos_sale_lines")
          .select("label,qty,unit_price,sale_id,pos_sales!inner(event_id,status)")
          .eq("pos_sales.event_id", eventId).eq("pos_sales.status", "paid");

        // What actually sold, biggest first.
        const byItem: Record<string, { label: string; qty: number; gross: number }> = {};
        for (const l of (lines || []) as any[]) {
          const k = l.label;
          byItem[k] ??= { label: k, qty: 0, gross: 0 };
          byItem[k].qty += l.qty;
          byItem[k].gross = money(byItem[k].gross + l.unit_price * l.qty);
        }
        const { data: items } = await db.from("pos_event_items")
          .select("label,stock_qty").eq("event_id", eventId).not("stock_qty", "is", null).order("label");

        return json({
          totals: totals || null,
          sales: sales || [],
          by_item: Object.values(byItem).sort((a, b) => b.gross - a.gross),
          stock: items || [],
        });
      }

      default:
        return json({ error: "Unknown action: " + action }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message || "Something went wrong." }, 400);
  }
});
