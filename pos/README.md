# K Co Register — the iPad POS for karikounkel.shop

A tiny retail register at `karikounkel.shop/pos`. Tap products, take card or cash,
giant SUCCESS screen, next customer. Every card sale lands in the same Stripe
account as the online store, tagged with the event name.

**Runs on the stack the shop already uses.** No new services, no app store, no build step:

| Piece | Where it lives |
|---|---|
| The register | `pos/index.html` — static page on Vercel |
| Setup + totals | `pos/admin.html` |
| The whole backend | `supabase/functions/pos/index.ts` — one Edge Function |
| Tables | `pos/schema.sql` — four `pos_` tables, additive |

---

## 1. The Stripe Reader M2 — read this first

**Don't buy the M2 for this.** It cannot be driven from a web page.

Stripe's own compatibility table
([POS partner guide](https://docs.stripe.com/extensibility/terminal-for-pos-partners#choose-your-integration)):

| Reader | Mobile SDKs (iOS/Android/RN) | JavaScript SDK | Server-driven |
|---|---|---|---|
| WisePOS E, S700/S710, Verifone | Yes | **Yes** | **Yes** |
| **Stripe Reader M2**, WisePad 3 | Yes | **No** | **No** |
| Tap to Pay | Yes | No | No |

The M2 is Bluetooth-only. Bluetooth pairing is only available through the iOS,
Android, or React Native SDKs — meaning a real native app, an Apple Developer
account, and App Store review, forever, for a register you use a few weekends a year.

**Tap to Pay is also out**, for a reason that has nothing to do with software:
it requires an **iPhone XS or later**. [It doesn't run on any iPad](https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=ios#supported-devices) —
no iPad has the payment NFC hardware. It would also need an Apple entitlement and app review.

### So: buy a smart reader

**BBPOS WisePOS E** — order from [dashboard.stripe.com/terminal/shop](https://dashboard.stripe.com/terminal/shop).
(The Stripe Reader S700 is the nicer sibling; the S710 adds cellular. Any of the
three works identically with this code. Check the shop for current prices — the
WisePOS E is the budget one, the M2 is cheaper still but useless here.)

A smart reader is its own little internet-connected computer. Your iPad tells
*Stripe* to charge, and Stripe tells the reader over the internet. The iPad and
the reader never talk to each other directly, so there is no pairing, no
same-network requirement, and nothing to install. This is the **server-driven
integration**, and it is the simplest reliable thing that exists.

### The verdict

| | Browser POS + smart reader | Native iPad app + M2 |
|---|---|---|
| What you build | A web page (done) | An iOS app, forever |
| Apple Developer account | No | Yes, $99/yr |
| App Store review | No | Yes, every update |
| Update the register | `git push` | Resubmit to Apple |
| Reader cost | Higher | Lower |
| Works today | Yes | Weeks of work |

**Recommendation: browser POS + one WisePOS E.** The reader costs more than the
M2; that difference buys you never maintaining an iOS app. For occasional
events this is not close.

**You can start selling before the reader arrives** — cash works now, and so does
the QR fallback (customer pays on their own phone). Add `POS_READER_ID` when
the hardware shows up and the CARD button lights up. Nothing else changes.

---

## 2. Setup, once

### Step 1 — create the tables

Supabase → SQL Editor → paste all of `pos/schema.sql` → Run.

Additive only: four new `pos_` tables, one view, one trigger. It does not touch
`products`, `orders`, or anything the store already uses.

### Step 2 — turn on Terminal in Stripe

1. [dashboard.stripe.com/terminal](https://dashboard.stripe.com/terminal) → enable Terminal.
2. **Locations** → **Create location**. Name it something like `K Co Events`, with
   your business address. One location is enough even though you move around —
   Stripe just needs an address on file.
3. Confirm your account can take in-person payments (Stripe will say if it needs anything).

### Step 3 — environment variables

All of these go in **Supabase → Project Settings → Edge Functions → Secrets**.
None of them ever reaches the iPad.

| Variable | What it is | Needed |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` — already set for the store | yes |
| `POS_ACCESS_CODE` | The passcode you type on the iPad. Pick something you'll remember but a stranger won't guess. | yes |
| `POS_READER_ID` | `tmr_…` from your registered reader | once you own one |
| `POS_ORIGIN` | `https://karikounkel.shop` — return URL for the QR fallback | optional |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | set by Supabase automatically | — |

```bash
supabase secrets set POS_ACCESS_CODE=your-passcode --project-ref lheytkgixafdhluuvrbg
```

> **The secret key never leaves the server.** The iPad holds only the public
> `anon` key (already public on the storefront) and your passcode. Every price
> is re-looked-up server-side, so nothing on the iPad can change what something
> costs. Card numbers never touch the iPad, this code, or your database — the
> reader is PCI-certified hardware that talks straight to Stripe.

### Step 4 — deploy

```bash
cd /c/dev/kkstore
supabase functions deploy pos --project-ref lheytkgixafdhluuvrbg
git add . && git commit -m "Add the K Co Register" && git push
```

Vercel picks up the push. Then open `https://karikounkel.shop/pos` and enter
your passcode.

### Step 5 — register the reader (when it arrives)

1. Power on the WisePOS E, join your WiFi in its settings.
2. On the reader: **Settings** (swipe, or tap the screen 5×) → it shows a
   **3-word pairing code**.
3. Stripe Dashboard → **Terminal** → your location → **Register reader** → type
   the 3 words.
4. Copy the reader's ID — it looks like `tmr_FabcdEF12345`.
5. `supabase secrets set POS_READER_ID=tmr_… --project-ref lheytkgixafdhluuvrbg`
6. Reload `/pos`. The chip in the top bar turns green and says **reader ready**.

**Test before your first event.** Register a *simulated* reader in test mode and
run a fake sale end to end, or do one real $1 sale on yourself and refund it.

---

## 3. How products sync with the shop

The register reads the **same `products` table** as karikounkel.shop. Nothing is
duplicated and nothing is re-entered.

In `/pos/admin` → **+ From the shop catalog** lists every live, preorder, and
coming-soon product. Tap one and it becomes a button, carrying its catalog price.

Two things it does *not* do, on purpose:

- **Event prices are copies, not links.** Change a price on a register button and
  it changes for that event only. The shop is untouched. (Several catalog books
  have no price yet — Ladybug Ladybug, Chasing Chickens — so you'll type one in.
  That's the normal case, not an error.)
- **Not everything you sell at a table is in the catalog.** *Tiny Town*,
  *Little Prescriptions*, and the Prayer Bible aren't there yet. Use
  **+ Blank button** for those, or **OTHER** on the register for one-offs.
  When they get real product pages, re-add them from the catalog.

**Inventory** is per-event and optional: put a number in the stock column ("I'm
bringing 12"). The tile shows *12 left*, counts down as you sell, and greys out
at zero. Leave it blank and nothing is tracked. It never touches shop stock —
what's on your table isn't what's in the warehouse.

---

## 4. Running an event

### Before you leave the house

1. `karikounkel.shop/pos/admin` on any device.
2. **Start a new event** — name, date, sales tax %. It opens the register automatically.
   (Leave tax at 0 if you aren't collecting it. Minnesota doesn't tax clothing,
   and most groceries; books are taxable. Ask your accountant — which is you.)
3. Add buttons: catalog items, blank ones, prices, stock counts. Arrows reorder
   them — put your best seller first. **Save buttons.**
4. Charge the iPad and the reader. Both need power and internet.

### At the table

Open `karikounkel.shop/pos` on the iPad. Passcode once; it's remembered.

> **Put it on the home screen.** Safari → Share → **Add to Home Screen**. It
> launches full-screen with no browser chrome and looks like a real register.
> Turn on **Guided Access** (Settings → Accessibility → Guided Access, then
> triple-click the side button) and a curious kid can't wander off into Safari.

**Tap product → tap product → CARD.** That's the whole flow. Adjust quantities
with − and + only if you need to. **OTHER** for a custom amount, **% DISCOUNT**
to take money off the whole sale, **✉ EMAIL** if they want a receipt.

Card: the reader wakes up showing the amount, they tap or insert, you get a
full-screen green **PAID**. Cash: punch in what they handed you and it tells you
the change to give back, in big numbers.

### Not double-charging anyone

This was designed for, not hoped about:

- Every cart gets one reference number. Re-submitting the same cart returns the
  **same** sale — the database enforces it with a unique index, and Stripe gets
  an idempotency key besides.
- Both pay buttons go dead the instant you tap one, and a full-screen overlay
  covers the register until the reader answers.
- A cart is cleared **only** after it's actually paid. There is no path where a
  sale succeeds and the cart is still sitting there ready to be charged again.
- If a card is declined, the cart survives and the *next* attempt is a genuinely
  new attempt — no reusing a spent PaymentIntent.
- Tapping CANCEL while the card is mid-read asks Stripe first. If the payment
  cleared in that half-second, it refuses to cancel and shows you the success
  screen instead of silently losing the money.

---

## 5. When something breaks

| What happened | What to do |
|---|---|
| **Internet dies** | The top bar turns orange: *OFFLINE — cash only*. Take cash; it records the moment you're back. Card genuinely cannot work — server-driven Terminal has no offline mode. A phone hotspot is the real fix. |
| **Reader won't wake / not registered** | The CARD button offers **Pay on their phone** — a QR code they scan to pay by Stripe Checkout. Tap **They paid** once it goes through. Slower, but nobody walks away. |
| **Card declined** | Big red screen with the reason. Cart intact. Try another card, or take cash. |
| **Reader never answers** | After ~5 minutes it gives up and says so. Nothing was charged. |
| **iPad dies mid-sale** | Nothing is lost. Every sale lives in the database before the reader is ever asked. Open the admin page on your phone to see where it stopped. |
| **You think you charged twice** | You almost certainly didn't — see above. Check Stripe → Payments, filter `metadata[source]=pos`. Refund from the Stripe dashboard if so. |
| **Forgot the passcode** | Reset `POS_ACCESS_CODE` in Supabase secrets and redeploy the function. |

Bring a **paper backup** anyway — a notebook and a phone hotspot have saved more
craft fairs than any app.

---

## 6. Reconciling afterward

Open `/pos/admin`, pick the event. You get:

- **Total taken**, split **card vs cash**, sale count, tax collected, discounts given
- **What sold** — every item, quantity, gross, biggest first
- **Stock left** — what to bring home
- **Every sale** with timestamp, tender, total, email, and the Stripe PaymentIntent id
- **Download CSV** — one row per sale, including the PaymentIntent id, for your books

Everything ties out three ways:

1. **Card totals** match Stripe. In the dashboard, search payments by
   `metadata[source]=pos` or `metadata[event_name]` to see exactly that event's
   card sales — they're in the same balance and the same payout as online orders,
   which is the whole point.
2. **Cash total** is what should be in the cash box. Count it and compare.
3. **The CSV** is your journal entry. Card row → Stripe clearing; cash row →
   undeposited funds.

Then **Close** the event in the admin page so the register won't accidentally
ring the next customer up against a finished fair.

> **Receipts.** Email receipts come from Stripe itself for card sales — set
> `receipt_email` and Stripe sends its own branded receipt and files a copy for
> disputes. Cash sales have no Stripe payment, so there's nothing for Stripe to
> send; the email is recorded against the sale instead. **Stripe does not send
> SMS receipts** through the API — if you want texted receipts later, the
> `kcocares.com` Twilio hub is already built and could take that job.

---

## 7. What this deliberately isn't

Small on purpose. No refunds in the register (do them in Stripe — rare, and
safer where you can see the whole payment). No tipping. No multi-user logins.
No barcode scanning. No offline card queue. No customer accounts.

If an event ever gets big enough to need those, that's a good problem and a
different afternoon.
