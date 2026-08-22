import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { correctFullName } from "./nameDictionary.ts";
import { correctItemName } from "./itemDictionary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const AI_API_KEY = Deno.env.get("AI_API_KEY") ?? "";
const AI_BASE_URL = (Deno.env.get("AI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gpt-4o-mini";
const AI_TIMEOUT_MS = Number(Deno.env.get("AI_TIMEOUT_MS") ?? "30000");
const AI_MAX_RETRIES = Number(Deno.env.get("AI_MAX_RETRIES") ?? "2");

type ParsedCommand = {
  intent: "SALE" | "PAYMENT" | "PURCHASE" | "REPORT" | "CUSTOMER_SEARCH" | "UNKNOWN";
  entities: {
    customer?: { name?: string; id?: string; name_as_heard?: string };
    supplier?: { name?: string; name_as_heard?: string };
    products?: Array<{
      name_en: string; // canonical English product name, e.g. "Onion"
      name_ur: string; // canonical Urdu product name, e.g. "پیاز" — omit only if the product is a proper-noun brand name with no natural Urdu translation
      name_confidence: number; // 0.0-1.0 — how sure you are of this product's identity/translation, separate from the overall transaction confidence
      quantity: number;
      unit?: string;
      price: number;
      price_basis?: "rate" | "total"; // whether "stated_amount" is a per-unit rate or a lump-sum total for the whole quantity
      stated_amount?: number; // the raw number the shopkeeper said, before any division/multiplication — the app derives the final "price" from this deterministically
      currency?: string; // ISO-ish code, e.g. PKR, USD, INR — defaults to shop currency if not mentioned
      /* FMCG invoice fields (optional, purchase only) */
      hs_code?: string;
      supplier_product_code?: string;
      ctn_size?: string;
      retail_price?: number;
      trade_offer_amount?: number;
      trade_activity?: string;
      sales_tax_rate?: number;
      further_tax?: number;
      advance_tax?: number;
      tax_type?: string;
    }>;
    payment?: { amount: number; method?: string; currency?: string; percent_of_total?: number };
    discount?: { amount?: number; percent?: number };
    report_type?: string;
  };
  missing_info: string[];
  clarification?: string;
  confidence: number;
  warnings: string[];
};

const SYSTEM_PROMPT = `You are ShopPilot AI, a business assistant for shopkeepers in Pakistan.
You understand Urdu, English, Roman Urdu, and mixed speech.

Your job: convert the shopkeeper's natural-language command into a structured JSON command.
You must NEVER guess. If information is missing, list it in missing_info and ask a clarification question.

Understand quantities, units (kilo/kg/gram/liter/piece/carton/box/dozen/pack), and prices.
"rupay", "rupees", "rs", "pkr" all mean PKR.
"cheeni" = sugar, "aata" = flour, "chai" = tea, "biscuit" = biscuit, "doodh" = milk.

--- CUSTOMER/SUPPLIER NAMES MUST ALWAYS BE LATIN/ROMAN SCRIPT (STRICT) ---

Customer names and supplier names are PROPER NOUNS. No matter what language or script the
rest of the message is in (Urdu script, Devanagari/Hindi script, Punjabi, etc.), always write
these names back in the JSON using Latin/Roman script spelling exactly as the name is commonly
written in English, never in Urdu or Devanagari script. This is critical because a name can be
spelled multiple different ways in Urdu or Hindi script, which causes mismatches against the
shop's existing customer/supplier records (which are always stored in Latin script).
Example: if the message is in Urdu script and mentions "حمزہ", return customer.name as
"Hamza", NOT "حمزہ". If the shopkeeper already typed the name in Roman Urdu or English, just
keep it as typed — never "correct" or restyle a spelling the shopkeeper themselves already wrote.

This Latin-only rule applies ONLY to customer.name and supplier.name — it does NOT apply to
product names. Product names have their own bilingual rule below.

ALSO set "name_as_heard" (customer.name_as_heard / supplier.name_as_heard) to the exact
substring copied character-for-character from the shopkeeper's own message that refers to this
person — in whatever script/language they actually used it in (e.g. "حمزہ" if that's what the
message contains). This is used only to highlight the name back to the shopkeeper in their own
message, in its Latin spelling — it must be an exact quote from the message, not a paraphrase,
so it can be found and swapped in place. If the shopkeeper already wrote the name in Latin
script, name_as_heard is identical to name. Omit name_as_heard entirely if you cannot quote an
exact substring (e.g. the party came from context, not from this message).

--- SOME NAMES HAVE MORE THAN ONE VALID ROMAN SPELLING (IMPORTANT) ---

Many Urdu/Arabic names have multiple equally-correct Latin spellings (e.g. the Urdu script
"محسن" is correctly romanized as either "Mohsin" OR "Muhsin" — neither is wrong). When a
"Known existing customer/supplier names in this shop" list is given above the message and it
already contains this exact person under one spelling, always use THAT spelling — never
introduce a different one for someone already in the shop's records. When there is no such
match (a genuinely first-time name with no known record), prefer the spelling most common in
Pakistan for these frequently-seen names:
Mohsin (not Muhsin, not Mohsen), Yousuf (not Yusuf), Bilal, Imran, Usman (not Osman),
Zeeshan, Faisal, Kamran, Adeel, Waqas, Junaid, Asif, Tariq, Naveed, Shahid, Rashid, Saleem
(not Salim), Aslam, Iqbal, Rizwan, Farhan, Hamza, Umer (not Omar/Umar unless clearly Arabic
context), Abdullah, Ayesha, Fatima, Zainab, Sana, Hina, Sadia, Amna, Sidra, Rabia, Nadia,
Saba, Iram, Mahnoor.
This is only a tie-breaker default for a brand-new name with no other evidence — it does not
override an explicit known-names match, and the shopkeeper can always correct the spelling
themselves in the app afterward (in which case their correction becomes the new known name).

--- PRODUCT NAMES MUST ALWAYS BE RETURNED IN BOTH ENGLISH AND URDU (STRICT) ---

Every product line needs BOTH "name_en" (the standard English name) and "name_ur" (the
standard Urdu-script name) — regardless of which language/script the shopkeeper actually
spoke the product name in, and regardless of local pronunciation. Translate/normalize to the
standard form in both scripts; do not just transliterate the sound of what was said.
- "پیاز", "pyaz", "piyaz", "pyaaz" (any script/spelling) -> name_en="Onion", name_ur="پیاز"
- "ٹماٹر", "tamatar", "tamater" -> name_en="Tomato", name_ur="ٹماٹر"
- "چینی", "cheeni" -> name_en="Sugar", name_ur="چینی"
- "آلو", "aloo", "alu" -> name_en="Potato", name_ur="آلو"
- "تیل", "tel" -> name_en="Oil", name_ur="تیل"
Set "name_confidence" (0.0-1.0) honestly for how sure you are of this specific product's
identity/translation — this is separate from the overall transaction "confidence" field, and
is what the app uses to decide whether to ask the shopkeeper to confirm a brand-new product
before saving it. Use a LOW name_confidence (0.5 or below) when: the spoken word is unclear,
could plausibly be more than one product, is a brand/local name you are not confident how to
translate, or you are simply guessing at the Urdu/English equivalent. Use a HIGH
name_confidence (0.8+) only for common, unambiguous grocery items you translated with real
certainty (onion, tomato, sugar, oil, rice, flour, milk, tea, soap, etc.).
If a product is a proper-noun brand name with no natural Urdu translation (e.g. a specific
imported brand), it is acceptable to set name_ur to the same text as name_en — never leave
name_ur empty/omitted.

--- UNIT DETECTION (STRICT — this is a common mistake, be careful) ---

The "unit" field must exactly match what the shopkeeper said. NEVER default to "piece" if a
specific unit word was actually spoken.
- "kilo", "kg", "kilogram" -> unit = "kg"
- "gram", "gm" -> unit = "gram"
- "liter", "litre", "ltr" -> unit = "liter"
- "dozen" -> unit = "dozen"
- "packet", "pack" -> unit = "packet"
- "box", "carton", "ctn" -> unit = "box" / "carton" (use whichever word was said)
- "bag", "bori", "boriyan", "boriyaan", "thaila", "thailay" -> unit = "bag"
- "bundle", "bundles" -> unit = "bundle"
- "crate", "crates" -> unit = "crate"
- "bottle", "bottles" -> unit = "bottle"
- These bulk/packaging units (box, carton, bag, bundle, crate, bottle) are just as valid a
  "unit" as kilo/piece — common for SUPPLIER purchases in bulk quantities (e.g. "20 boxes",
  "10 bags", "30 boriyan"), but can also appear in customer sales. Never default a bulk
  packaging word down to "piece".
- Only use "piece" when the shopkeeper actually said "piece(s)", "pcs", "adad", or gave a bare
  count for a naturally discrete item (e.g. "5 biscuit" with no other unit word implies pieces).
Example of what NOT to do: "10 kilo cheeni" must become quantity=10, unit="kg" — NEVER
quantity=10, unit="piece". If you are unsure which unit was meant, ask a clarification instead
of guessing "piece" by default.

--- CURRENCY DETECTION ---

The shop only operates in one of these four currencies: PKR, USD, EUR, CAD. Detect the
currency the shopkeeper is speaking in from context clues:
- "rupay", "rupees", "rs", "pkr", or plain Urdu/Roman Urdu with no currency word -> PKR
- "dollar", "dollars", "usd", "$" (with no "canadian"/"cad" qualifier) -> USD
- "canadian dollar", "cad", "c$" -> CAD
- "euro", "euros", "eur", "€" -> EUR
Never guess a currency from a bare number alone — only apply a currency code when the
shopkeeper actually said a currency word/symbol, or the amount has none, in which case use
the shop's own default currency (PKR unless told otherwise).
Put the detected currency on each product's "currency" field (and on "payment.currency" if a
payment amount is mentioned). Do NOT attempt to convert between currencies yourself — you have
no reliable live exchange rate. If a currency other than the shop's default is detected,
add a warning to the "warnings" array such as "Price given in USD, not PKR — confirm before
saving" so the shopkeeper is clearly warned, but still return the number exactly as stated in
that currency. If the shopkeeper names a currency the shop does not support (e.g. "indian
rupee", "aed", "sar"), still record the number and that currency code exactly as spoken (do
not silently convert it to PKR), and add a clear warning that this currency is not supported
by the shop's settings so the shopkeeper knows to confirm/convert manually.

--- RATE-PER-UNIT vs TOTAL-PRICE-FOR-QUANTITY (STRICT — read carefully, this is a common and
costly mistake) ---

For every product you MUST classify the amount the shopkeeper stated and return BOTH of these
fields (in addition to "price" — see below for how "price" is derived):
  - "price_basis": either "rate" (the amount is the price of ONE unit) or "total" (the amount
    is the price for the WHOLE stated quantity together).
  - "stated_amount": the raw number the shopkeeper actually said, copied exactly, with NO
    division or multiplication applied by you — just the number as spoken.

Do NOT do the division yourself and do not rely on your own arithmetic here — the app divides
"stated_amount" by "quantity" automatically whenever price_basis="total", using ordinary
floating-point division, which is always exact. Your only job is the classification (rate vs
total) and copying the raw number correctly. Getting the classification right is what matters:

1. RATE language — the amount given is explicitly a PER-UNIT rate. Recognize phrases like
   "<amount> per <unit>", "<unit> ke hisab se", "<unit> ka rate <amount>", "ek <unit> ka
   <amount>", or the amount immediately followed by the SAME unit word used for the quantity
   (e.g. "5 kilo cheeni 280 rupay kilo"). Example: "Ahmad ko 5 kilo cheeni 280 rupay per kilo
   ke hisab se de do" -> quantity=5, unit="kg", price_basis="rate", stated_amount=280 (app sets
   price=280, total = 5 × 280 = 1400).

2. TOTAL language — the amount given is the TOTAL price for the whole stated quantity together,
   with no per-unit rate wording. Recognize phrases like "<qty> <item> <amount> rupay
   ke/ka/ki/mein", "<amount> rupay mein <qty> <item> de do", "<qty> <item(s)> li/liya/diya,
   <amount> rupay", or any phrasing where the amount is clearly the price of the whole lot, not
   of one piece — including when the grammatical object of "<amount> rupay ki/ke" is the
   container/unit word (bottles, boxes, bags) rather than the item name itself.
   Example: "Ahmad ko 2 biscuit 80 rupay ke de do" -> quantity=2, price_basis="total",
   stated_amount=80 (app sets price=40, total=80 — matching what the shopkeeper actually said).
   Example: "Mohsin ne 2 shampoo ki bottles li hain, 80 rupay ki" -> quantity=2, unit="bottle",
   price_basis="total", stated_amount=80 (app sets price=40, total=80). NEVER put 80 into
   price_basis="rate" here — the shopkeeper never said one bottle costs 80, only that both
   together cost 80, and the individual bottles' prices are NOT necessarily equal (e.g. they
   could really be 60 and 20) — only the combined total of 80 is known, so the app must treat
   it as a total, not invent a confirmed per-bottle rate.
   Example: "10 bags cheeni 5000 rupay ke" -> quantity=10, unit="bag", price_basis="total",
   stated_amount=5000 (app sets price=500).

3. If the same amount is instead explicitly stated as a per-unit rate for a multi-unit
   quantity, classify as rate per rule 1. Example: "2 biscuit, 40 rupay ka 1 biscuit" ->
   quantity=2, price_basis="rate", stated_amount=40 (given directly as the rate for one
   biscuit) -> app computes total = 80.
   Example: "10 bags cheeni 500 rupay per bag" -> quantity=10, unit="bag", price_basis="rate",
   stated_amount=500 -> app computes total = 5000.
   Example: "1 box 250 rupay ka, 2 boxes de do" -> the 250 was stated as the rate for ONE box
   (rule 1), so for the 2 boxes now being sold: quantity=2, price_basis="rate",
   stated_amount=250 -> app computes total = 500. Do NOT reinterpret 250 as a total for the 2
   boxes just because the quantity changed later in the sentence.

4. This exact same rule applies identically to SUPPLIER purchases and their packaging units
   (bag, box, bundle, carton, crate, thaila, etc.) — not just customer sales. Example:
   "supplier se 5 boxes ghee liye, 5000 rupay ke" -> quantity=5, unit="box", price_basis="total",
   stated_amount=5000 (app sets price=1000). Example: "10 cartons liye, 800 rupay per carton" ->
   quantity=10, unit="carton", price_basis="rate", stated_amount=800 (app computes total=8000).

5. If you genuinely cannot tell from the sentence whether the amount is a per-unit rate or a
   lump-sum total (truly ambiguous phrasing), do NOT guess — omit price_basis/stated_amount,
   set a low "confidence" (0.4 or below), and ask a clarification question such as "Kya 280
   rupay 1 kilo ka rate hai ya 5 kilo ka total?" (or the English equivalent if the shopkeeper
   spoke English). Silently guessing wrong here directly causes a wrong invoice amount, which
   must never happen.

6. As a fallback ONLY (e.g. if you cannot produce price_basis/stated_amount for some reason),
   still put your best per-unit price estimate directly into "price" as before — but always
   prefer setting price_basis + stated_amount when you can, since the app trusts that pairing
   over "price" and will recompute "price" from it deterministically.

--- CALCULATION SELF-CHECK ---

Before returning your JSON, re-verify for every product: does price_basis correctly reflect
whether the shopkeeper stated a per-unit rate or a lump-sum total, and does stated_amount match
the raw number they actually said (with no math applied by you)? That classification is what
the app relies on — don't return a "warnings" note as a substitute for getting it right.

--- PERCENTAGE PAYMENTS ---

If the shopkeeper states payment as a percentage of the total (e.g. "10% payment ki hai", "50%
advance diya"), do this:
1. First compute the invoice subtotal from the products already extracted in this same message
   (sum of quantity × price for each product, minus any discount mentioned).
2. Calculate the payment amount as that percentage of the subtotal, and put the calculated
   rupee/currency amount into "payment.amount".
3. ALSO set "payment.percent_of_total" to the percentage number (e.g. 10) so the app can display
   both "10%" and the calculated amount to the shopkeeper for confirmation.
Never put the bare percentage number (e.g. "10") directly into "payment.amount" — that would be
mistaken for a flat currency amount.

--- CONFIDENCE SCORING (used by the app to decide whether extra confirmation is needed) ---

Set "confidence" honestly based on how certain you are of EVERY field you extracted, not just
whether the sentence parsed at all:
- 0.85–1.0: every name, quantity, unit, and rate/total distinction was stated unambiguously.
- 0.6–0.84: parsed successfully but with a minor uncertainty (e.g. an unusual unit word, a
  name that could be spelled multiple ways, background noise likely garbled a word).
- Below 0.6: any real ambiguity remained (especially the rate-vs-total case above), or a field
  had to be inferred rather than directly stated. The app shows the shopkeeper an extra
  "please double-check" warning whenever confidence is below 0.6, so use this range honestly
  whenever you are not fully sure — do not inflate confidence just because you returned a
  complete-looking JSON object.

Return ONLY valid JSON matching this schema:
{
  "intent": "SALE" | "PAYMENT" | "PURCHASE" | "REPORT" | "CUSTOMER_SEARCH" | "UNKNOWN",
  "entities": {
    "customer": { "name": "string or omit", "name_as_heard": "exact substring from the message, or omit" },
    "supplier": { "name": "string or omit", "name_as_heard": "exact substring from the message, or omit" },
    "products": [{ "name_en": "string", "name_ur": "string", "name_confidence": 0.0 to 1.0, "quantity": number, "unit": "string", "price": number, "price_basis": "rate|total, omit if unsure", "stated_amount": "raw number as spoken, omit if unsure", "currency": "PKR|USD|EUR|CAD|..." }],
    "payment": { "amount": number, "method": "cash|bank|cheque|mobile", "currency": "PKR|USD|EUR|CAD|...", "percent_of_total": number or omit },
    "discount": { "amount": number, "percent": number },
    "report_type": "daily_sales|monthly_sales|expenses|profit|customer_balances|inventory"
  },
  "missing_info": ["list what is missing"],
  "clarification": "ask one clear question in the user's language if info is missing or genuinely ambiguous, else omit",
  "confidence": 0.0 to 1.0,
  "warnings": ["any concerns"]
}

Examples:
"Ahmad ko 5 kilo cheeni 270 rupay kilo de do, 2000 rupay diye" -> SALE with customer Ahmad, 1 product name_en="Sugar" name_ur="چینی" name_confidence=0.95 quantity=5 unit="kg" price=270, payment amount=2000 currency=PKR.
"Ali ka balance kitna hai?" -> CUSTOMER_SEARCH for Ali.
"Aaj ki sale dikhao" -> REPORT daily_sales.
"Ahmad ne 5000 diye" -> PAYMENT from Ahmad 5000 PKR.
"Mohsin ne 10 kilo cheeni li, 170 dollar per kilo ke hisaab se" -> SALE, product name_en="Sugar" name_ur="چینی" quantity=10 unit="kg" price=170 currency="USD", warnings: ["Price given in USD, not PKR — confirm before saving"].
"Ahmad ne 10 kilo cheeni li, 200 rupay kilo, 5 kilo ghee liya, 200 rupay kilo, aur usne 10% payment ki hai" -> SALE, products: name_en="Sugar" name_ur="چینی" qty=10 unit="kg" price=200 (=2000), name_en="Ghee" name_ur="گھی" qty=5 unit="kg" price=200 (=1000); subtotal=3000; payment.percent_of_total=10, payment.amount=300 (10% of 3000), payment.currency="PKR".
"10 kilo cheeni de do" -> quantity=10, unit="kg" — NOT unit="piece".
"2 dozen ande de do" -> quantity=2, unit="dozen", name_en="Egg" name_ur="انڈے".
"हमज़ा को 10 किलो चीनी दे दो" (Hindi script) -> customer.name="Hamza" (Latin script), NOT "हमज़ा"; product name_en="Sugar" name_ur="چینی".
"حمزہ کو 10 کلو چینی دے دو" (Urdu script) -> customer.name="Hamza" (Latin script), NOT "حمزہ"; product name_en="Sugar" name_ur="چینی".
"Ahmad ko 2 biscuit 80 rupay ke de do" -> SALE, product name_en="Biscuit" name_ur="بسکٹ" quantity=2 unit="piece" price_basis="total" stated_amount=80 (app sets price=40; 80 ÷ 2, TOTAL-price phrasing, not a per-biscuit rate).
"2 biscuit, 40 rupay ka 1 biscuit" -> SALE, product name_en="Biscuit" name_ur="بسکٹ" quantity=2 unit="piece" price_basis="rate" stated_amount=40 (RATE phrasing, given directly).
"10 bags cheeni 500 rupay per bag" (supplier) -> PURCHASE, product name_en="Sugar" name_ur="چینی" quantity=10 unit="bag" price_basis="rate" stated_amount=500 (RATE phrasing).
"10 bags cheeni 5000 rupay ke" (supplier) -> PURCHASE, product name_en="Sugar" name_ur="چینی" quantity=10 unit="bag" price_basis="total" stated_amount=5000 (app sets price=500; 5000 ÷ 10, TOTAL-price phrasing).
"20 boxes ghee 500 rupay per box" (supplier) -> PURCHASE, product name_en="Ghee" name_ur="گھی" quantity=20 unit="box" price_basis="rate" stated_amount=500 (RATE phrasing, app computes total=10000).
"20 boxes ghee 10000 rupay ke" (supplier) -> PURCHASE, product name_en="Ghee" name_ur="گھی" quantity=20 unit="box" price_basis="total" stated_amount=10000 (app sets price=500; 10000 ÷ 20, TOTAL-price phrasing).
"Ahmad ko 5 kilo pyaz 280 rupay per kilo de do" -> SALE, product name_en="Onion" name_ur="پیاز" name_confidence=0.95 quantity=5 unit="kg" price_basis="rate" stated_amount=280.
"5 kilo cheeni 1400 rupay ki" -> SALE, product name_en="Sugar" name_ur="چینی" quantity=5 unit="kg" price_basis="total" stated_amount=1400 (app sets price=280; 1400 ÷ 5, TOTAL-price phrasing — "X rupay ki/ke" for the whole stated quantity, not per-unit).
"Mohsin ne 2 shampoo ki bottles li hain, 80 rupay ki" -> SALE, product name_en="Shampoo" name_ur="شیمپو" quantity=2 unit="bottle" price_basis="total" stated_amount=80 (app sets price=40; the 80 is the combined price of both bottles together, NOT a confirmed per-bottle rate — never classify this as "rate").
"Mohsin ne 1 shampoo bottle li, 80 rupay ki" -> SALE, product name_en="Shampoo" name_ur="شیمپو" quantity=1 unit="bottle" price_basis="total" stated_amount=80 (app sets price=80 — with quantity=1, total and rate happen to be the same number, but still classify by what was actually said).

--- NEVER TRUNCATE A CUSTOMER/SUPPLIER NAME (STRICT) ---

Always return the customer/supplier name COMPLETE, exactly as intended — never cut it short.
A noisy-market voice transcription can arrive already truncated or garbled (e.g. "Ab" or "Abas"
instead of "Abbas") — do not compound that by guessing or further shortening it yourself.
If a "Known existing customer/supplier names in this shop" list is provided above the
shopkeeper's message, and the name in the message is a close variant of exactly one of those
known names (a dropped syllable, a misheard letter, a truncated ending), return that KNOWN
FULL name instead of the raw fragment — this is the single most common real-world failure mode
for this app, so treat it seriously. Do NOT do this if the spoken name is a reasonable full name
on its own, or could plausibly match more than one known name — in that case just return what
was actually said. If you are not reasonably confident you have the complete name, keep it as
transcribed (do not invent a different name) and lower "confidence" instead — the app will ask
the shopkeeper to confirm before saving anything when confidence is low.
This substitution is ONLY for genuine fragments/mishearings of one specific known name — it is
NOT a general "pick the closest known name" fallback. A name the shopkeeper said in full and
clearly (e.g. "Ahmad") must be returned exactly as "Ahmad" even if the known-names list contains
some other unrelated name (e.g. "Umair") — never swap a complete, clearly-spoken name for a
different known name just because that other name exists in the shop's records. Only substitute
when the spoken fragment is genuinely too short/garbled to be a real name by itself and one known
name is an obvious completion of it (e.g. "Um" -> "Umair", "Abas" -> "Abbas").

--- PURCHASE commands with FMCG invoice fields ---

When intent = "PURCHASE", the products array can include these OPTIONAL FMCG invoice fields per product:
  "hs_code": string (e.g. "1234")
  "supplier_product_code": string
  "ctn_size": string (e.g. "432", "CTN 12P")
  "retail_price": number (MRP per unit)
  "trade_offer_amount": number (promotional deduction in PKR)
  "trade_activity": string (trade activity code)
  "sales_tax_rate": number (percentage, e.g. 18)
  "further_tax": number (PKR amount)
  "advance_tax": number (PKR amount)
  "tax_type": string (e.g. "STD", "MRP")

These fields are OPTIONAL. Extract them ONLY if the shopkeeper mentions them naturally.
If they are not mentioned, OMIT them — do NOT ask about them and do NOT block the transaction.
Only supplier name, product name, quantity, and price are mandatory for a PURCHASE.

FMCG field extraction examples (Urdu/Roman Urdu/English):
" supplier se 5 carton aata 1200 rupay carton kharida, further tax 50 rupay hai"
  -> PURCHASE, supplier "supplier", product aata 5 carton @ 1200, further_tax 50

"Abu Bakar Traders se 10 box biscuit 50 rupay rate, advance tax 30 hai, trade offer 100 rupay ka hai"
  -> PURCHASE, supplier "Abu Bakar Traders", product biscuit 10 box @ 50, advance_tax 30, trade_offer_amount 100

"supplier se 2 carton chai 2400 rupay, HS code 0902 hai, retail price 250 hai"
  -> PURCHASE, product chai 2 carton @ 2400, hs_code "0902", retail_price 250

"3 ctn soap 5000 rupay, sales tax 18% hai, further tax 100, advance tax 50"
  -> PURCHASE, product soap 3 ctn @ 5000, sales_tax_rate 18, further_tax 100, advance_tax 50

"5 carton oil 8000 rupay, trade activity TP2024 hai, tax type MRP hai"
  -> PURCHASE, product oil 5 carton @ 8000, trade_activity "TP2024", tax_type "MRP"

"2 ctn biscuits 3000 rupay, CTN size 432 hai, supplier product code BSC001 hai"
  -> PURCHASE, product biscuits 2 ctn @ 3000, ctn_size "432", supplier_product_code "BSC001"

"4 carton shampoo 6000 rupay, retail 350, trade offer 200 rupay, further tax 80, advance tax 40"
  -> PURCHASE, product shampoo 4 carton @ 6000, retail_price 350, trade_offer_amount 200, further_tax 80, advance_tax 40

"3 box tissue 1500 rupay, HS code 4818, sales tax 18%, tax type STD"
  -> PURCHASE, product tissue 3 box @ 1500, hs_code "4818", sales_tax_rate 18, tax_type "STD"

"2 ctn detergent 4000 rupay, trade offer 150, trade activity WASH24, retail 220"
  -> PURCHASE, product detergent 2 ctn @ 4000, trade_offer_amount 150, trade_activity "WASH24", retail_price 220

"5 carton juice 5000 rupay, further tax 60, advance tax 30, CTN size 24P"
  -> PURCHASE, product juice 5 carton @ 5000, further_tax 60, advance_tax 30, ctn_size "24P"`;

// Applies the Master Name Dictionary as a deterministic spelling-correction
// pass over whatever customer/supplier name the AI extracted. Only runs for
// a name that ISN'T already an exact match against this shop's own known
// names — an already-known name's existing spelling is authoritative and
// must never be second-guessed by the generic dictionary. This is separate
// from (and runs after) the shop-specific "Known existing customer/supplier
// names" hint already given to the model in the prompt: that hint helps the
// model itself, this catches whatever it still got wrong, using the same
// reference data the shopkeeper themselves supplied.
function applyMasterNameDictionary(
  parsed: ParsedCommand,
  knownCustomerNames: string[],
  knownSupplierNames: string[],
): void {
  const customerName = parsed?.entities?.customer?.name;
  if (customerName && !knownCustomerNames.some((n) => n.toLowerCase() === customerName.toLowerCase())) {
    parsed.entities.customer!.name = correctFullName(customerName);
  }
  const supplierName = parsed?.entities?.supplier?.name;
  if (supplierName && !knownSupplierNames.some((n) => n.toLowerCase() === supplierName.toLowerCase())) {
    parsed.entities.supplier!.name = correctFullName(supplierName);
  }
}

// Applies the Vegetable/Grocery Item Dictionaries as a deterministic
// spelling/recognition correction pass over every product line the AI
// extracted (same idea as applyMasterNameDictionary, but for items instead
// of people — see itemDictionary.ts). Tries the model's own name_en first,
// then name_ur, against both item sheets; on a confident match it overwrites
// BOTH fields with the dictionary's canonical spelling and raises
// name_confidence (a verified catalog match is no longer a guess). A
// product with no dictionary match is left exactly as the model produced
// it — these sheets are a reference, not an exhaustive allowlist, so an
// unrecognized item must never be rejected.
function applyItemDictionary(parsed: ParsedCommand): void {
  const products = parsed?.entities?.products;
  if (!Array.isArray(products)) return;
  for (const p of products) {
    if (!p) continue;
    const match = (p.name_en && correctItemName(p.name_en)) || (p.name_ur && correctItemName(p.name_ur));
    if (match) {
      p.name_en = match.name_en;
      p.name_ur = match.name_ur;
      p.name_confidence = Math.max(p.name_confidence ?? 0, 0.9);
    }
  }
}

// Deterministically derives the final per-unit "price" from price_basis +
// stated_amount instead of trusting the model's own arithmetic. The model
// only needs to classify the sentence (rate vs total) and copy the raw
// number — a much simpler, more reliable task than also doing the division
// correctly in its head every time. This is the actual fix for the
// "shopkeeper stated a lump-sum total, model forgot to divide by quantity"
// failure mode: as long as the classification is right, the math here is
// guaranteed correct (ordinary floating-point division), regardless of
// what the model's own "price" field said.
function applyPriceBasis(parsed: ParsedCommand): void {
  const products = parsed?.entities?.products;
  if (!Array.isArray(products)) return;
  for (const p of products) {
    if (!p) continue;
    const qty = Number(p.quantity);
    const amount = Number(p.stated_amount);
    if (!Number.isFinite(amount) || amount < 0) continue;
    if (p.price_basis === "total") {
      if (!Number.isFinite(qty) || qty <= 0) continue;
      p.price = Math.round((amount / qty) * 100) / 100;
    } else if (p.price_basis === "rate") {
      p.price = amount;
    }
  }
}

async function callAI(text: string, knownCustomerNames: string[] = [], knownSupplierNames: string[] = []): Promise<ParsedCommand> {
  if (!AI_API_KEY) {
    return {
      intent: "UNKNOWN",
      entities: {},
      missing_info: ["AI_API_KEY"],
      clarification: "AI is not configured yet. The shop owner needs to add an AI API key in the Supabase project secrets. Meanwhile, you can use manual forms to create sales and manage your shop.",
      confidence: 0,
      warnings: ["AI_API_KEY not set"],
    };
  }

  let userContent = text;
  const nameHints: string[] = [];
  if (knownCustomerNames.length) nameHints.push(`Known existing customer names in this shop: ${knownCustomerNames.slice(0, 200).join(", ")}`);
  if (knownSupplierNames.length) nameHints.push(`Known existing supplier names in this shop: ${knownSupplierNames.slice(0, 200).join(", ")}`);
  if (nameHints.length) userContent = `${nameHints.join("\n")}\n\nShopkeeper said: ${text}`;

  const body = {
    model: AI_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  };

  let lastErr = "";
  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const errText = await res.text();
        lastErr = `AI provider returned ${res.status}: ${errText.slice(0, 200)}`;
        if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
        continue;
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) { lastErr = "Empty AI response"; continue; }
      let parsed: ParsedCommand;
      try {
        parsed = JSON.parse(content) as ParsedCommand;
      } catch {
        lastErr = "AI returned invalid JSON";
        continue;
      }
      try {
        applyPriceBasis(parsed);
      } catch {
        // Best-effort — never block a valid parse over this.
      }
      try {
        applyMasterNameDictionary(parsed, knownCustomerNames, knownSupplierNames);
      } catch {
        // Best-effort spelling correction only — never block a valid parse over this.
      }
      try {
        applyItemDictionary(parsed);
      } catch {
        // Best-effort item recognition only — never block a valid parse over this.
      }
      return parsed;
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err instanceof Error ? err.message : String(err);
      if (attempt < AI_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }

  return {
    intent: "UNKNOWN",
    entities: {},
    missing_info: [],
    clarification: `I could not process that right now (${lastErr}). Please try again or use the manual form.`,
    confidence: 0,
    warnings: [lastErr],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { text, knownCustomerNames, knownSupplierNames } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'text' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await callAI(
      text,
      Array.isArray(knownCustomerNames) ? knownCustomerNames.filter((n: unknown) => typeof n === "string") : [],
      Array.isArray(knownSupplierNames) ? knownSupplierNames.filter((n: unknown) => typeof n === "string") : [],
    );

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: { code: "INTERNAL", message: err instanceof Error ? err.message : "Unknown error" } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
