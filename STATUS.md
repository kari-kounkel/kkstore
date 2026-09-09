# kkstore — STATUS
_Rebuilt from chat transcripts on 2026-08-25. Update this file at the end of every work session ("update STATUS.md")._

## What this is
Kari's store — karikounkel.shop — a static HTML store with a "chicken dealer" dealing product cards, Stripe checkout via Supabase Edge Functions, and an admin page. Also holds the **Court of Accounts (CoA)** book product page (`coa/`): order the book, Stripe checkout, PDF delivery, thanks page, and a tools page. Sibling sites touched in the same chats: karikounkel.com (marble jar homepage + About spiral, GitHub Pages) and the cross-project "Empire" infrastructure pass.

## Where it lives
- Code: `C:\dev\kkstore`
- Live: `karikounkel.shop` (stated as the store domain); Vercel `kkstore-kohl.vercel.app`
- Supabase (kkstore): `lheytkgixafdhluuvrbg`
- CoA page domain: `coa.karikounkel.com` or `coa.caresmn.com` — Kari "leans karikounkel"; not confirmed (verify). Page was published 07-28 (URL not in excerpt — verify).
- GitHub remote: not stated (verify)
- GA4 property: `G-WHKMKCD1SD` (the canonical id; see audit note below)
- Related: karikounkel.com repo `C:\dev\karikounkel` → GitHub Pages `https://kari-kounkel.github.io/karikounkel/` (Kari chose the Pages link, no DreamHost)

## Chat(s) that built it
| Chat name | Last active | Resume command |
|---|---|---|
| Court of Accounts product page | 2026-07-29 | `cd /c/dev/flowsuite-pro && claude --resume "Court of Accounts product page"` |
| Empire infrastructure standardization | 2026-08-24 | `cd /c/dev/keepstead && claude --resume "Empire infrastructure standardization"` |

## Built so far
**K Co Register — the iPad POS at `/pos` (2026-09-08/09)**
- ✅ `pos/index.html` — the register. Big product tiles, cart with ± quantities, OTHER (custom amount), % DISCOUNT, ✉ EMAIL, CARD / CASH, giant full-screen PAID / NOT PAID screens, cash-change display, passcode gate, online + reader status chips, QR "pay on their phone" fallback.
- ✅ `pos/admin.html` — pick which products appear, reorder with ▲▼, rename, override prices, per-event stock counts, taxable toggle, event name/date/tax rate, event totals (card vs cash vs phone), what-sold table, stock-left table, every-sale log, CSV export.
- ✅ `supabase/functions/pos/index.ts` — the entire backend, one action-routed Edge Function. Deno type-check passes clean.
- ✅ `pos/schema.sql` — `pos_events`, `pos_event_items`, `pos_sales`, `pos_sale_lines` + `pos_event_totals` view + stock-decrement trigger. Additive; touches nothing existing. **Not yet run** — Kari runs SQL herself.
- ✅ `pos/README.md` — full setup doc: Stripe settings, hardware verdict, reader registration, env vars, catalog sync, iPad launch, starting an event, reconciling, failure modes.
- ✅ `vercel.json` — added `/pos` and `/pos/admin` rewrites plus `noindex` + `no-store` headers on `/pos/*`.
- ✅ Verified in-browser at 1180×820 landscape and 820×1180 portrait: grid, cart, keypad, tax math ($159 → 6.875% → $169.93; with a $20 discount → $148.56), cash-change screen, admin event list + report. Client and server price math use the same formula, so the total never changes at payment time.
- ⬜ Not yet done: run `schema.sql`, `supabase functions deploy pos`, set `POS_ACCESS_CODE`, git push, buy a reader.

**Court of Accounts product page (Jul 28–29)**
- ✅ `coa/index.html`, `coa/thanks.html`, `coa/tools.html`, `coa/api/get-pdf.js` — CoA page with ordering, PDF delivery (`Court_of_Accounts_Bold_and_Playful_3.pdf` for now — "it's got one more edit")
- ✅ `supabase/functions/stripe-webhook/index.ts` — Stripe order webhook (an order-alert webhook built 07-28 was later found redundant — see audit)
- ✅ Memory: `coa-brand-palette.md`, `cross-publish-locked-rule.md`, `kkstore-store-architecture.md`
- ✅ `ECOSYSTEM-ARCHITECTURE.html` / `.md` on Desktop\claude
- ✅ 07-29 overnight audit: three scouts tested all 17 repos against reality; THE-LIST.html backed up (`THE-LIST.backup-2026-07-29.html`), new gold **🔍 AUDIT 7/29** lane + banner + badges on every corrected item; JS syntax-verified
- ✅ Audit findings recorded: `kcocares.com` notification hub already exists (`ask-kari-chat/supabase/functions/hub/index.ts`, 263 lines: Twilio SMS + SendGrid email + Anthropic AI-drafted replies "as Kari" with AI disclosure) but domain not live / not fully deployed; `priority.html` $26 paid-gate widget is real; GA4 is 5 separate properties (cares-works has canonical `G-WHKMKCD1SD` **plus** a legacy id = double counting; caresmn, flowsuite-pro, founders each own id; flowsuite-legacy and flowsuite-dac none); CoA reader has 15 chapters wired but only the prologue is live (ch1–3 locked, ch4–13 not surfaced) and the reader has no link to the store/buy

**Empire chat — store-specific (from 05-31)**
- ✅ Product cards fixed: images no longer cut off (`object-fit:contain`), uniform white tiles
- ✅ GA4 added
- ✅ Trad-store header/footer matched to the playful dealer page (light hero, no brown footer)
- ✅ "All" view sorted into chicken-headed category sections
- ✅ Dealer-modal-close bug fixed
- ✅ Mobile: dealer hen shrunk, filter chips hidden on mobile
- ✅ 9 "coming soon" creative works added as products
- ✅ Files: `index.html`, `admin.html`, `supabase/functions/create-checkout/index.ts`, `vercel.json`
- ⬜ Planned, not confirmed built: CARES Works Membership SKU, tools as products, cross-links between apps

## Empire infrastructure standardization (cross-project)
Started 2026-05-31 from a "MASTER BUILD DIRECTIVE: Empire Infrastructure & Launch" (from Kari via Monet): single pass, all platforms, everything standardized/audited/live so Kari can market without patching infra. Operating principle stated: **no hardcoded org names or domain URLs — use environment variables** (directive text truncated in excerpt).

What it standardized / delivered (per excerpt):
- **Analytics + widget standard:** GA4 `G-WHKMKCD1SD` and the Ask Kari widget as the site standard (memory `feedback_ga4_widget_standard.md`, `reference_ask_kari_widget.md`); GA4 added to kkstore and karikounkel.com (`app.js`).
- **Notifications:** Twilio account connected (Kari has Twilio; wants to route messaging through one number — number choice discussed, not resolved in excerpt); `kcocares.com` set up as the notification-hub domain; hub code lives in `ask-kari-chat/supabase/functions/hub/index.ts` (memory `project_notification_hub.md`). API keys/secrets were to go into a secure table on the Everything Board (verify done).
- **DNS / email map:** `reference_dns_email_map.md`.
- **"Everything on the store" rule:** `feedback_everything_on_the_store.md`; store addendum `project_store_empire_addendum.md`.
- **karikounkel.com:** GA4, mobile marble jar, About page = spiral of 14 life-story chapters with "The Keeper" hero image, click-to-reveal, repo-driven `/about` linked from "my story" (`about.html`, `about-app.js`, `marbles.js`).
- **caresmn.com:** `index.html` rebuilt (memory `project_caresmn_rebuild.md`).
- **cares-works:** `KariCockpits.jsx`, `KariOneList.jsx`, `KariCockpitFrame.jsx` (embed HTML tools with cloud sync).
- **Inventories on Desktop:** `Tool Inventory_Vibecoded Tools_2026-05-31.html`, `Creative & Ministry Inventory_2026-05-31.html`, `Desktop Audit Cockpit.html` (memory `project_vibecoded_tools_library.md`).
- **FlowSuite Pro:** Minuteman policy/contract export → `Minuteman_Policies_Review_2026-07-07.html` (118 docs, Kari's Union Contract notes as gold callouts, reviewer edit boxes, no credentials/PII); hired Kim Alexander (position, applicant, `hire_applicant` RPC), onboarding link doc `Kim_Alexander_Onboarding_and_NDA_Link.txt`; **NDA onboarding task** — finger-signable formatted NDA (8 clauses, MN law) hosted at `https://kari-kounkel.github.io/karikounkel/nda.html` (renders; Supabase Edge/Storage serve HTML as text/plain + nosniff so it would not render there), DB trigger `auto_complete_nda_upload()` / `trg_auto_complete_nda` auto-approves the `nda` task on upload; "template — have reviewed" footer removed; `BrandingTab.jsx`, `ApAging.jsx` + `VendorConfirmModal.jsx`, `MasterAdmin.jsx`, `CompanyAdminSetup.jsx`, `CustomizationQueue.jsx`, `Privacy.jsx`, `docs/ASSESSMENT.md` written.
- **08-24:** Kim Alexander separation (termination for cause) letter PDF built on green Minuteman header text — `Minuteman_Kim_Alexander_Termination_Letter.pdf` copied to all three Desktop locations; Kim made an active employee (Office Admin) so Separations will list her.

Where it stopped (08-24): the last delivered item was the separation-letter PDF. Still open from the same days: `CandidatePortal.jsx` `renderTaskCard` needed a `task_type==='nda'` special case (link FIRST, upload SECOND, no "Mark complete") — marked "NEEDS EDITING NEXT" at compaction, completion not confirmed (verify); Kim reported the link opening an old version on her computer (08-12). On 08-23/24 Kari asked whether to build an entirely new interface or keep patching FlowSuite Pro, needed a QuickBooks simulation "by tomorrow" (cares-works `/prographics` and `/emerson` are the working QBO replacement for now, modeled on `tools.caresmn.com/proresources`), and asked for an overnight build "as much as we can" — the outcome of that overnight build is not in the excerpt (verify). Edge functions `put-nda-page` (failed uploader) should be cleaned up; `dump-resources` already retired (returns 410); `nda-doc` superseded by Pages.

## Decisions (and why)
- **POS: browser at `/pos`, not a native iPad app.** Stripe's own compatibility table says the **Stripe Reader M2 cannot be driven from a web page** — Bluetooth mobile readers work only through the iOS/Android/React Native SDKs, never the JavaScript SDK or server-driven integration. **Tap to Pay is also impossible on iPad** (iPhone XS or later only — no iPad has payment NFC). So the choice was: buy a smart reader and keep a web page, or buy the M2 and maintain an iOS app with an Apple Developer account and App Store review forever. **Verdict: browser POS + one BBPOS WisePOS E** (server-driven integration — the iPad tells Stripe, Stripe tells the reader over the internet; no pairing, no same-network requirement).
- **Nothing is locked to the M2.** The register works today with cash and the QR fallback; the CARD button lights up the moment `POS_READER_ID` is set.
- **Reuse the existing `products` table**, don't build a second catalog. Event buttons are *copies* of catalog rows — editing an event price never touches the shop. Event-only items (Tiny Town, Little Prescriptions, Prayer Bible — not in the catalog) are blank buttons.
- **Prices are always re-looked-up server-side.** The iPad can only send item ids and quantities; the one exception is a custom amount.
- **Double charges made hard on purpose:** one `client_ref` per cart with a unique DB index + a Stripe idempotency key; pay buttons dead while in flight; the cart clears only after a sale is actually paid; a failed attempt gets a fresh reference so it can never reuse a spent PaymentIntent; CANCEL asks Stripe first and refuses if the card already cleared.
- **`pos_` tables are service-role only** (RLS on, no policies) — the public anon key cannot read sales. The POS is gated by `POS_ACCESS_CODE`, compared length-independently.
- **Receipts: Stripe's own**, via `receipt_email`. Stripe has no SMS receipt API — texting would mean routing through the existing `kcocares.com` Twilio hub.
- **CoA page modeled on the Ladybug Ladybug page** but treated as business; domain leaning `coa.karikounkel.com`.
- **Store cards must be the chicken-dealer card style**, with keywords/SEO, and new products must **cross-publish everywhere** without re-explaining ("cross-publish locked rule") — Kari's 07-19 spec: a new tool gets a marble on karikounkel.com, an item in the store(s), a card on tools.caresmn.com, and something on caresmn.com.
- **Rethink cares-works' role** — earlier plan said skip it; Kari says it has a useful page for this.
- **Every change to THE-LIST must be highlighted** (gold 🔍 AUDIT 7/29 badge) so Kari can see what Claude touched.
- **Call the existing `kcocares.com` hub** for order alerts/SMS/email instead of new webhooks — the 07-28 order-alert webhook was redundant.
- **HTML that must render for humans goes on GitHub Pages**, not Supabase Edge/Storage (text/plain + nosniff).
- **NDA flow:** real readable/signable document, link before upload, auto-complete on upload, no "Mark complete", do not start over.
- **karikounkel.com/about via GitHub Pages link, no DreamHost.**
- **No hardcoded org names / domain URLs** (Empire directive).

## Where it stopped
POS chat (2026-09-09): everything is written, syntax- and type-checked, and visually verified against a stubbed API in both iPad orientations. Nothing has been deployed and no SQL has been run — that's Kari's four commands (see Next steps 0). Kari asked mid-build whether she gets a way to edit the cards and prices (yes — `/pos/admin`) and whether it works on her iPad (yes — Safari, Add to Home Screen; the CARD button needs the smart reader).

Court of Accounts chat: 07-29, the audit reconciliation into THE-LIST.html was finished and verified while Kari slept. Kari's standing verdict on the CoA page itself was "I hate this page... it's boring", and "there's no single thing" (no single source of truth for the ecosystem) — she asked to find a July-19-era chat where she spent an hour explaining the site map. The PDF still has one more edit pending. Empire chat: see section above — ended 08-24 on the separation letter with the new-UI-vs-patch-Pro decision open.

## Next steps
0. **Turn the POS on** — in order: run `pos/schema.sql` in the Supabase SQL editor → `supabase secrets set POS_ACCESS_CODE=…` → `supabase functions deploy pos` → `git push` → open `karikounkel.shop/pos`. Then order a **BBPOS WisePOS E** from [dashboard.stripe.com/terminal/shop](https://dashboard.stripe.com/terminal/shop), register it to a Terminal Location, and set `POS_READER_ID`. Full walkthrough in `pos/README.md`.
1. Find the site-map chat (around 07-19) and rebuild the CoA page so it isn't boring — chicken-dealer card style, SEO keywords, on-brand palette (`coa-brand-palette.md`).
2. Wire order alerts through the existing `kcocares.com` hub; get `kcocares.com` deployed/live.
3. Unify GA4 — remove the legacy double-count id from cares-works and decide one property vs five.
4. Surface CoA reader chapters beyond the prologue and link the reader to the store/buy page; swap in the final edited PDF.
5. Build the planned store SKUs (CARES Works Membership, tools) and the cross-publish pipeline (marble + store card + tools.caresmn.com card + caresmn.com).

## Pending / frozen items
- **Waiting on Kari (POS):** buy the reader (WisePOS E — **not** the M2); pick a `POS_ACCESS_CODE`; decide the sales-tax rate per event (books are taxable in MN; set 0 if not collecting); confirm the real prices for Ladybug Ladybug, Chasing Chickens, Prayer Bible, Tiny Town, Little Prescriptions — several have `price: null` in the catalog and three aren't in it at all.
- **POS not deployed yet:** schema not run, function not deployed, secrets not set. Nothing is live until those four commands run.
- **Waiting on Kari:** final CoA PDF edit; domain choice (`coa.karikounkel.com` vs `coa.caresmn.com`); "what pro suite is supposed to be" structure doc — not found on 08-21 ("it's not there").
- **Waiting on Kari:** new interface vs keep patching FlowSuite Pro (08-23).
- **Not found (08-19):** the separate tool Kari built to finish Frank's tax returns (showed two year-ends with an upload per balance-sheet account) — search came up empty.
- **Failed/cleanup:** `put-nda-page` edge function (storage serves text/plain); stale `org_branding.logo_url` for Minuteman (object 404s) needs re-upload; Kim's link showed an old version on her computer (08-12).
- **Skipped for now:** I-9 handling — "carry on without the i9, I'll find the chat about it" (08-24).
- **Not live:** `kcocares.com` hub domain.
- **Verify:** whether API keys/secrets got into a secure Everything Board table; Twilio number consolidation (Google Voice vs 507 vs new 651 number) — undecided in excerpt.

## Key files
- **POS:** `C:\dev\kkstore\pos\index.html` (the register), `pos\admin.html` (setup + totals), `pos\schema.sql`, `pos\README.md` (setup doc), `supabase\functions\pos\index.ts` (the whole backend)
- `C:\dev\kkstore\index.html`, `admin.html`, `vercel.json`
- `C:\dev\kkstore\coa\index.html`, `thanks.html`, `tools.html`, `api\get-pdf.js`
- `C:\dev\kkstore\supabase\functions\create-checkout\index.ts`, `stripe-webhook\index.ts`
- `C:\dev\karikounkel\index.html`, `app.js`, `marbles.js`, `about.html`, `about-app.js`, `nda.html`
- `C:\dev\ask-kari-chat\supabase\functions\hub\index.ts` — notification hub
- `C:\dev\caresmn\index.html`; `C:\dev\cares-works\src\pages\KariCockpits.jsx`, `KariOneList.jsx`, `KariCockpitFrame.jsx`
- `C:\dev\flowsuite-pro\src\pages\CandidatePortal.jsx`, `docs\ASSESSMENT.md`
- `C:\Users\karik\OneDrive - CARES Consulting Inc\Desktop\claude\THE-LIST.html` (+ `THE-LIST.backup-2026-07-29.html`), `ECOSYSTEM-ARCHITECTURE.html/.md`, `Kim_Alexander_Onboarding_and_NDA_Link.txt`
- `C:\Users\karik\OneDrive - CARES Consulting Inc\Desktop\NDA_to_sign.html`, `Minuteman_Policies_Review_2026-07-07.html`, `Minuteman_Kim_Alexander_Termination_Letter.pdf`, `Tool Inventory_Vibecoded Tools_2026-05-31.html`, `Creative & Ministry Inventory_2026-05-31.html`, `Desktop Audit Cockpit.html`
- `C:\Users\karik\.claude\projects\C--dev-flowsuite-pro\memory\` — coa-brand-palette.md, cross-publish-locked-rule.md, kkstore-store-architecture.md
- `C:\Users\karik\.claude\projects\C--dev-keepstead\memory\` — feedback_everything_on_the_store.md, feedback_ga4_widget_standard.md, project_notification_hub.md, project_store_empire_addendum.md, project_karikounkel_marble_jar.md, project_caresmn_rebuild.md, project_vibecoded_tools_library.md, reference_ask_kari_widget.md, reference_dns_email_map.md
