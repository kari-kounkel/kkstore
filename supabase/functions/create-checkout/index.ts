import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) return json({ error: "Stripe not configured yet (STRIPE_SECRET_KEY missing)." }, 500);
    const stripe = new Stripe(key, { apiVersion: "2024-06-20" });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { items, origin } = await req.json();
    if (!Array.isArray(items) || !items.length) return json({ error: "Cart is empty" }, 400);

    const ids = items.map((i: any) => i.id);
    const { data: prods, error } = await supabase.from("products").select("id,title,price,image_url,images,product_type,status").in("id", ids);
    if (error) return json({ error: error.message }, 500);

    const line_items: any[] = [];
    let shippable = false;
    for (const i of items) {
      const p = prods?.find((x: any) => x.id === i.id);
      if (!p || p.price == null || p.status !== "live") continue;
      const qty = Math.max(1, Math.min(99, parseInt(i.qty) || 1));
      const img = (p.images && p.images.length) ? p.images[0] : p.image_url;
      line_items.push({
        quantity: qty,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(parseFloat(p.price) * 100),
          product_data: { name: p.title, ...(img ? { images: [img] } : {}) },
        },
      });
      if (p.product_type === "physical_ship") shippable = true;
    }
    if (!line_items.length) return json({ error: "Nothing buyable in your cart right now." }, 400);

    const base = origin || "https://kkstore-kohl.vercel.app";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      allow_promotion_codes: true,
      success_url: base + "/?success=1",
      cancel_url: base + "/?canceled=1",
      ...(shippable ? {
        shipping_address_collection: { allowed_countries: ["US"] },
        shipping_options: [{
          shipping_rate_data: { type: "fixed_amount", fixed_amount: { amount: 500, currency: "usd" }, display_name: "Standard shipping (US)" },
        }],
      } : {}),
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: (e as Error).message || "Checkout error" }, 500);
  }
});
