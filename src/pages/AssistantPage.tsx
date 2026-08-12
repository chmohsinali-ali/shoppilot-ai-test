import { useEffect, useRef, useState, FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Sparkles, Mic, Send, MicOff, Check, X, Edit, User, ShoppingBag,
  Wallet, Package,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { EmbeddedPartyPicker, PickedParty } from '@/components/EmbeddedPartyPicker';
import { PartyConfirmCard, ConfirmCandidate } from '@/components/PartyConfirmCard';
import { isNearMatch, levenshteinDistance, compareToContextName } from '@/lib/nameMatch';
import { formatMoney } from '@/lib/format';

type ParsedCommand = {
  intent: string;
  entities: {
    customer?: { name?: string };
    supplier?: { name?: string };
    products?: Array<{
      name: string; quantity: number; unit?: string; price: number; currency?: string;
      hs_code?: string; supplier_product_code?: string; ctn_size?: string;
      retail_price?: number; trade_offer_amount?: number; trade_activity?: string;
      sales_tax_rate?: number; further_tax?: number; advance_tax?: number; tax_type?: string;
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

type PaymentPreview = {
  kind: 'payment';
  customerName: string;
  customerId: string | null;
  amount: number;
  currency: string;
  percentOfTotal: number | null;
  previousBalance: number | null;
  newBalance: number | null;
};

// The language a message should actually be DISPLAYED/rendered in. Distinct
// from ReplyLang below, which is the (finer-grained) category detected from
// the shopkeeper's own input — Roman Urdu input, for example, still
// *renders* as real Urdu script (RenderLang 'ur'), never as Roman Urdu, per
// the shop's language policy: the AI understands Roman Urdu but never
// replies in it.
type RenderLang = 'ur' | 'hi' | 'en';

// A picker/confirmation card attached to an assistant message, covering
// every situation where a customer/supplier name needs a human decision
// before a preview can be built:
//  - 'multiple': several existing parties share the exact spoken name —
//    renders the searchable EmbeddedPartyPicker.
//  - 'confirm-one': exactly one existing party has this exact name — still
//    asks "is this them, or a new person with the same name?" rather than
//    silently auto-selecting.
//  - 'fuzzy': no exact match, but 1-3 existing names are a close (but not
//    identical) match — likely a speech-recognition/spelling variant.
//    Similar names are never auto-merged.
//  - 'context-typo': inside a dedicated customer/supplier chat, the spoken
//    name is a near (not exact, not unrelated) match of the chat's own
//    bound party.
type PartyPickerState = {
  kind: 'customer' | 'supplier';
  mode: 'multiple' | 'confirm-one' | 'fuzzy' | 'context-typo';
  spokenName: string;
  candidates: ConfirmCandidate[];
  parsed: ParsedCommand;
  lang: ReplyLang;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  lang?: RenderLang;
  parsed?: ParsedCommand;
  preview?: SalePreview | PurchasePreview | PaymentPreview;
  savedLink?: string;
  savedAccountLink?: string;
  savedAccountLabel?: string;
  needsPicker?: PartyPickerState;
};

// Very lightweight language detection so the assistant knows what language
// the shopkeeper is typing/speaking in. This is not perfect linguistic
// detection — it only needs to distinguish Urdu script, common Roman Urdu
// words, Hindi (Devanagari) script, and plain English well enough for short
// shop commands.
type ReplyLang = 'ur' | 'roman' | 'hi' | 'en';

const DEVANAGARI_RANGE = String.fromCharCode(0x0900) + '-' + String.fromCharCode(0x097f);
const ARABIC_RANGE = String.fromCharCode(0x0600) + '-' + String.fromCharCode(0x06ff);
const DEVANAGARI_RE = new RegExp('[' + DEVANAGARI_RANGE + ']');
const ARABIC_RE = new RegExp('[' + ARABIC_RANGE + ']');

function detectReplyLang(text: string): ReplyLang {
  if (DEVANAGARI_RE.test(text)) return 'hi'; // contains Devanagari (Hindi) script
  if (ARABIC_RE.test(text)) return 'ur'; // contains Urdu/Arabic script
  const romanUrduWords = /\b(ko|de|do|ka|ki|ke|hai|hain|rupay|kilo|kharido|becha|diya|diye|khate|mein|kar|karo|kitna|dikhao|bhi)\b/i;
  if (romanUrduWords.test(text)) return 'roman';
  return 'en';
}

// Maps a detected input language to the language a reply should actually be
// written in. Roman Urdu input is understood, but always answered in real
// Urdu script — the app never generates Roman Urdu itself.
function renderLangOf(lang: ReplyLang): RenderLang {
  if (lang === 'hi') return 'hi';
  if (lang === 'ur' || lang === 'roman') return 'ur';
  return 'en';
}

function tpl(lang: ReplyLang, strings: { en: string; ur: string; hi?: string }): string {
  const renderLang = renderLangOf(lang);
  if (renderLang === 'hi') return strings.hi ?? strings.en;
  if (renderLang === 'ur') return strings.ur;
  return strings.en;
}

type SalePreview = {
  kind: 'sale';
  customerName: string;
  customerId: string | null;
  customerPhone: string;
  isNewCustomer: boolean;
  previousBalance: number;
  lines: Array<{ name: string; qty: number; unit: string; price: number; total: number; currency: string }>;
  subtotal: number;
  discount: number;
  grandTotal: number;
  amountPaid: number;
  paymentPercent: number | null;
  balance: number;
  currencyWarning: string | null;
};

type PurchasePreview = {
  kind: 'purchase';
  supplierName: string;
  supplierId: string | null;
  lines: Array<{
    name: string; qty: number; unit: string; price: number; total: number;
    hs_code?: string; supplier_product_code?: string; ctn_size?: string;
    retail_price?: number; trade_offer_amount?: number; trade_activity?: string;
    sales_tax_rate?: number; further_tax?: number; advance_tax?: number; tax_type?: string;
    netAmount: number;
  }>;
  subtotal: number;
  totalTradeOffer: number;
  totalFurtherTax: number;
  totalAdvanceTax: number;
  grandTotal: number;
  amountPaid: number;
  balance: number;
};

const SUGGESTIONS = [
  'احمد کو 5 کلو چینی 270 روپے کلو کے حساب سے دے دو، 2000 روپے دیے',
  'علی کا بیلنس کتنا ہے؟',
  'آج کی سیل دکھائیں',
  'احمد نے 5000 روپے دیے',
];

export function AssistantPage() {
  const { shop, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();

  // Active context: when opened via "AI Chat" from a Customer or
  // Supplier detail page, these carry who the shopkeeper is already
  // looking at, so they don't have to repeat the name in every message.
  // This is the SAME chat/page/memory as the main "AI Assistant" nav
  // item — just entered with a pre-set context, not a separate system.
  const activeCustomerId = params.get('customerId');
  const activeCustomerName = params.get('customerName');
  const activeSupplierId = params.get('supplierId');
  const activeSupplierName = params.get('supplierName');
  const activeContext = activeCustomerId
    ? { kind: 'customer' as const, id: activeCustomerId, name: activeCustomerName ?? '' }
    : activeSupplierId
    ? { kind: 'supplier' as const, id: activeSupplierId, name: activeSupplierName ?? '' }
    : null;

  // Each conversation THREAD is stored separately — Global Chat, and
  // each individual Customer's / Supplier's dedicated chat, all have
  // their own history. They all use the exact same AI engine and logic
  // (this same component) — only the stored conversation is separate,
  // so opening Hamza's chat never shows Global chat history or another
  // customer's chat.
  const storageKey = activeContext
    ? `shoppilot_ai_chat_${activeContext.kind}_${activeContext.id}`
    : 'shoppilot_ai_chat_global';

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Message[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState<'ur-PK' | 'en-PK' | 'hi-IN'>('en-PK');
  const [confirming, setConfirming] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // When a spoken name needs a human decision (duplicate name, near-match,
  // or a dedicated-chat name mismatch), buildSalePreview/etc set this ref so
  // finishTurn() can attach the appropriate confirmation card to the
  // assistant's reply message. Using a ref (not state) because it's set
  // synchronously during preview-building and read immediately after in
  // the same turn — no re-render needed for it specifically.
  const pickerNeededRef = useRef<PartyPickerState | null>(null);

  // Tracks the phone number typed into a new-customer's invoice preview
  // (keyed by message id), since a new customer's first invoice requires
  // a phone number before it can be confirmed/saved.
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Persist chat history so navigating away (e.g. tapping "View invoice"
  // or opening a customer page) and coming back does NOT reset the
  // conversation. Cleared automatically when the browser tab closes.
  // Saved under the current thread's own key (Global / this Customer /
  // this Supplier) so threads never bleed into each other.
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(messages)); } catch { /* ignore quota errors */ }
  }, [messages, storageKey]);

  // If the thread changes WITHOUT a full remount (e.g. navigating from
  // Hamza's dedicated chat straight to Mohsin's dedicated chat, or from
  // a Customer chat to the Global chat, via client-side routing), load
  // that thread's own saved history instead of continuing to show the
  // previous thread's messages.
  const loadedKeyRef = useRef(storageKey);
  useEffect(() => {
    if (loadedKeyRef.current === storageKey) return;
    loadedKeyRef.current = storageKey;
    try {
      const raw = sessionStorage.getItem(storageKey);
      setMessages(raw ? (JSON.parse(raw) as Message[]) : []);
    } catch {
      setMessages([]);
    }
  }, [storageKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const callAI = async (text: string): Promise<ParsedCommand> => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message ?? 'AI error');
    return json.data as ParsedCommand;
  };

  const fetchBalance = async (table: 'customers' | 'suppliers', id: string): Promise<number | undefined> => {
    if (table === 'customers') {
      const { data } = await supabase.rpc('get_customer_balance', { p_customer_id: id });
      return typeof data === 'number' ? data : undefined;
    }
    const { data } = await supabase.rpc('get_supplier_balance', { p_supplier_id: id });
    return typeof data === 'number' ? data : undefined;
  };

  // Resolve a spoken name (e.g. "Hamza") against customers/suppliers.
  // Every outcome that involves an existing person now requires an
  // explicit human confirmation before any invoice/payment preview is
  // built — including a SINGLE exact match, since a brand-new walk-in
  // customer can share a name with someone already in the system.
  //
  //  - 'none': no exact AND no near-match candidate exists anywhere in
  //    this shop -> genuinely a brand-new person, caller may auto-create
  //    with no question asked.
  //  - 'exact-one': exactly one exact (case-insensitive) name match ->
  //    caller must show a confirm-or-new-customer card.
  //  - 'exact-multiple': two or more people share this exact name ->
  //    caller must show the searchable duplicate picker.
  //  - 'fuzzy': no exact match, but 1-3 existing names are a close
  //    (Levenshtein) match — likely a speech-recognition/spelling variant
  //    (e.g. "Ali Raja" for "Ali Raza") -> caller must ask which one, or
  //    confirm it's actually a new person. Similar names are NEVER
  //    auto-merged.
  const resolvePartyWithConfirmation = async (
    table: 'customers' | 'suppliers', nameColumn: 'full_name' | 'supplier_name', name: string
  ): Promise<
    | { kind: 'none' }
    | { kind: 'exact-one'; party: ConfirmCandidate }
    | { kind: 'exact-multiple'; count: number }
    | { kind: 'fuzzy'; candidates: ConfirmCandidate[] }
  > => {
    const { data: exactMatches, count } = await supabase
      .from(table).select(`id, ${nameColumn}, primary_phone`, { count: 'exact' })
      .eq('shop_id', shop!.id).ilike(nameColumn, name);

    if (exactMatches && exactMatches.length === 1) {
      const row = exactMatches[0] as any;
      const balance = await fetchBalance(table, row.id);
      return { kind: 'exact-one', party: { id: row.id, name: row[nameColumn], phone: row.primary_phone ?? undefined, balance } };
    }
    if (exactMatches && exactMatches.length > 1) {
      return { kind: 'exact-multiple', count: count ?? exactMatches.length };
    }

    // Zero exact matches — check for near-match candidates among this
    // shop's existing parties before treating this as a brand-new person,
    // so a speech-recognition/spelling slip never silently creates a
    // duplicate record for someone who already exists.
    const { data: allRows } = await supabase.from(table).select(`id, ${nameColumn}, primary_phone`).eq('shop_id', shop!.id);
    const near = ((allRows ?? []) as any[])
      .filter((row) => isNearMatch(name, row[nameColumn]))
      .map((row) => ({ id: row.id as string, name: row[nameColumn] as string, phone: row.primary_phone ?? undefined, distance: levenshteinDistance(name, row[nameColumn]) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);

    if (near.length === 0) return { kind: 'none' };

    const candidates: ConfirmCandidate[] = [];
    for (const n of near) {
      candidates.push({ id: n.id, name: n.name, phone: n.phone, balance: await fetchBalance(table, n.id) });
    }
    return { kind: 'fuzzy', candidates };
  };

  // Create a brand-new customer/supplier record — only ever called after
  // either (a) no exact/near match exists at all, or (b) the shopkeeper
  // explicitly confirmed "this is a new person" on a confirm/fuzzy/
  // duplicate-picker card.
  const autoCreateParty = async (table: 'customers' | 'suppliers', nameColumn: 'full_name' | 'supplier_name', name: string): Promise<{ id: string; name: string } | null> => {
    const { data, error } = await supabase.from(table).insert({ shop_id: shop!.id, [nameColumn]: name, status: 'active' } as any).select('id').single();
    if (error || !data) return null;
    return { id: (data as any).id, name };
  };

  // Compares a spoken party name against a dedicated chat's own bound
  // customer/supplier. Returns 'not-applicable' when there's no dedicated
  // context of the matching type, or no name was actually spoken (in which
  // case the existing "no name mentioned, assume the context" shortcut
  // applies instead).
  const evaluateDedicatedContext = (
    partyKind: 'customer' | 'supplier', spokenName: string | undefined
  ): 'not-applicable' | 'same' | 'near' | 'different' => {
    if (!activeContext || activeContext.kind !== partyKind || !spokenName) return 'not-applicable';
    return compareToContextName(spokenName, activeContext.name);
  };

  const dedicatedBlockMessage = (ctxName: string, kind: 'customer' | 'supplier', lang: ReplyLang): string => {
    const word = kind === 'customer' ? 'کسٹمر' : 'سپلائر';
    return tpl(lang, {
      en: `This chat is only for ${ctxName}'s account. If you want to add a different ${kind}, please go to the AI Assistant and add a new ${kind} there.`,
      ur: `یہ چیٹ صرف ${ctxName} کے حساب کتاب کے لیے ہے۔ اگر آپ کسی دوسرے نئے ${word} کا کھاتا بنانا چاہتے ہیں تو AI Assistant میں جا کر نیا ${word} ایڈ کریں۔`,
    });
  };

  const buildSalePreview = async (parsed: ParsedCommand, forcedParty?: { id: string; name: string }, sourceText: string = ''): Promise<SalePreview | null> => {
    if (parsed.intent !== 'SALE' || !parsed.entities.products?.length) return null;
    const shopCurrency = shop?.currency ?? 'PKR';
    const lines = parsed.entities.products.map((p) => ({
      name: p.name, qty: p.quantity, unit: p.unit ?? 'piece', price: p.price, total: p.quantity * p.price,
      currency: p.currency ?? shopCurrency,
    }));
    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    const discount = parsed.entities.discount?.amount ?? 0;
    const grandTotal = Math.max(0, subtotal - discount);
    const paymentPercent = parsed.entities.payment?.percent_of_total ?? null;
    // If the shopkeeper stated payment as a percentage, ALWAYS compute the
    // actual amount ourselves from the reliable grandTotal we just
    // calculated — never trust the AI's own internally-computed amount for
    // a percentage, since it can drift from the products it also returned
    // in the same response (a known LLM self-consistency limitation).
    const amountPaid = paymentPercent != null
      ? Math.round(grandTotal * (paymentPercent / 100) * 100) / 100
      : (parsed.entities.payment?.amount ?? 0);
    const balance = Math.max(0, grandTotal - amountPaid);
    const nonShopCurrencyLine = lines.find((l) => l.currency !== shopCurrency);
    const currencyWarning = nonShopCurrencyLine
      ? `${nonShopCurrencyLine.name} price is in ${nonShopCurrencyLine.currency}, not ${shopCurrency} — please confirm before saving.`
      : (parsed.warnings?.length ? parsed.warnings.join(' ') : null);
    const lang = detectReplyLang(sourceText || parsed.entities.customer?.name || '');
    let customerId: string | null = null;
    let customerName = parsed.entities.customer?.name ?? 'Walk-in';
    if (forcedParty) {
      customerId = forcedParty.id; customerName = forcedParty.name;
    } else if (!parsed.entities.customer?.name && activeContext?.kind === 'customer') {
      // No name mentioned in this message, but the shopkeeper is on a
      // specific customer's page/chat — assume they mean that customer.
      customerId = activeContext.id; customerName = activeContext.name;
    } else if (parsed.entities.customer?.name) {
      const spokenName = parsed.entities.customer.name;
      const guard = evaluateDedicatedContext('customer', spokenName);

      if (guard === 'same') {
        customerId = activeContext!.id; customerName = activeContext!.name;
      } else if (guard === 'near') {
        parsed.clarification = tpl(lang, {
          en: `Please confirm below.`,
          ur: `براہ کرم نیچے تصدیق کریں۔`,
        });
        pickerNeededRef.current = {
          kind: 'customer', mode: 'context-typo', spokenName,
          candidates: [{ id: activeContext!.id, name: activeContext!.name }],
          parsed, lang,
        };
        return null;
      } else if (guard === 'different') {
        parsed.clarification = dedicatedBlockMessage(activeContext!.name, 'customer', lang);
        return null;
      } else {
        const resolved = await resolvePartyWithConfirmation('customers', 'full_name', spokenName);
        if (resolved.kind === 'exact-multiple') {
          parsed.clarification = tpl(lang, {
            en: `There are ${resolved.count} customers named "${spokenName}". Please look at the list below and select the correct customer.`,
            ur: `"${spokenName}" نامی ${resolved.count} کسٹمر موجود ہیں۔ براہ کرم نیچے دی گئی فہرست میں سے درست کسٹمر منتخب کریں۔`,
          });
          pickerNeededRef.current = { kind: 'customer', mode: 'multiple', spokenName, candidates: [], parsed, lang };
          return null;
        } else if (resolved.kind === 'exact-one') {
          parsed.clarification = tpl(lang, {
            en: `Found an existing customer named "${spokenName}". Please confirm below.`,
            ur: `"${spokenName}" نامی کسٹمر پہلے سے موجود ہے۔ براہ کرم نیچے تصدیق کریں۔`,
          });
          pickerNeededRef.current = { kind: 'customer', mode: 'confirm-one', spokenName, candidates: [resolved.party], parsed, lang };
          return null;
        } else if (resolved.kind === 'fuzzy') {
          parsed.clarification = tpl(lang, {
            en: `"${spokenName}" is close to an existing name. Please confirm below who you mean.`,
            ur: `"${spokenName}" سے ملتا جلتا نام پہلے سے موجود ہے۔ براہ کرم نیچے تصدیق کریں کہ آپ کس کی بات کر رہے ہیں۔`,
          });
          pickerNeededRef.current = { kind: 'customer', mode: 'fuzzy', spokenName, candidates: resolved.candidates, parsed, lang };
          return null;
        } else {
          // No exact or near match at all — this is a genuinely new
          // person. Create them automatically and continue straight to
          // the invoice preview, no question asked.
          const created = await autoCreateParty('customers', 'full_name', spokenName);
          if (created) { customerId = created.id; customerName = created.name; }
        }
      }
    }
    let customerPhone = '';
    let isNewCustomer = false;
    let previousBalance = 0;
    if (customerId) {
      const { data: cust } = await supabase.from('customers').select('primary_phone').eq('id', customerId).maybeSingle();
      customerPhone = cust?.primary_phone ?? '';
      const { count: priorSales } = await supabase.from('sales').select('id', { count: 'exact', head: true }).eq('customer_id', customerId);
      // "New customer, first invoice" = no phone on file yet AND this
      // will be their first sale ever — matches the requested rule
      // exactly, and also protects a manually-added customer with no
      // phone who hasn't had a sale yet.
      isNewCustomer = !customerPhone && (priorSales ?? 0) === 0;
      const { data: bal } = await supabase.rpc('get_customer_balance', { p_customer_id: customerId });
      previousBalance = typeof bal === 'number' ? bal : 0;
    }
    return { kind: 'sale', customerName, customerId, customerPhone, isNewCustomer, previousBalance, lines, subtotal, discount, grandTotal, amountPaid, paymentPercent, balance, currencyWarning };
  };

  const buildPurchasePreview = async (parsed: ParsedCommand, forcedParty?: { id: string; name: string }, sourceText: string = ''): Promise<PurchasePreview | null> => {
    if (parsed.intent !== 'PURCHASE' || !parsed.entities.products?.length) return null;
    const lines = parsed.entities.products.map((p) => {
      const gross = p.quantity * p.price;
      const tradeOffer = p.trade_offer_amount ?? 0;
      const furtherTax = p.further_tax ?? 0;
      const advanceTax = p.advance_tax ?? 0;
      const net = gross - tradeOffer + furtherTax + advanceTax;
      return {
        name: p.name, qty: p.quantity, unit: p.unit ?? 'piece', price: p.price, total: gross,
        hs_code: p.hs_code, supplier_product_code: p.supplier_product_code, ctn_size: p.ctn_size,
        retail_price: p.retail_price, trade_offer_amount: p.trade_offer_amount, trade_activity: p.trade_activity,
        sales_tax_rate: p.sales_tax_rate, further_tax: p.further_tax, advance_tax: p.advance_tax, tax_type: p.tax_type,
        netAmount: net,
      };
    });
    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    const totalTradeOffer = lines.reduce((s, l) => s + (l.trade_offer_amount ?? 0), 0);
    const totalFurtherTax = lines.reduce((s, l) => s + (l.further_tax ?? 0), 0);
    const totalAdvanceTax = lines.reduce((s, l) => s + (l.advance_tax ?? 0), 0);
    const grandTotal = subtotal - totalTradeOffer + totalFurtherTax + totalAdvanceTax;
    const amountPaid = parsed.entities.payment?.amount ?? 0;
    const balance = Math.max(0, grandTotal - amountPaid);
    const lang = detectReplyLang(sourceText || parsed.entities.supplier?.name || '');
    let supplierId: string | null = null;
    let supplierName = parsed.entities.supplier?.name ?? 'Unknown Supplier';
    if (forcedParty) {
      supplierId = forcedParty.id; supplierName = forcedParty.name;
    } else if (!parsed.entities.supplier?.name && activeContext?.kind === 'supplier') {
      supplierId = activeContext.id; supplierName = activeContext.name;
    } else if (parsed.entities.supplier?.name) {
      const spokenName = parsed.entities.supplier.name;
      const guard = evaluateDedicatedContext('supplier', spokenName);

      if (guard === 'same') {
        supplierId = activeContext!.id; supplierName = activeContext!.name;
      } else if (guard === 'near') {
        parsed.clarification = tpl(lang, {
          en: `Please confirm below.`,
          ur: `براہ کرم نیچے تصدیق کریں۔`,
        });
        pickerNeededRef.current = {
          kind: 'supplier', mode: 'context-typo', spokenName,
          candidates: [{ id: activeContext!.id, name: activeContext!.name }],
          parsed, lang,
        };
        return null;
      } else if (guard === 'different') {
        parsed.clarification = dedicatedBlockMessage(activeContext!.name, 'supplier', lang);
        return null;
      } else {
        const resolved = await resolvePartyWithConfirmation('suppliers', 'supplier_name', spokenName);
        if (resolved.kind === 'exact-multiple') {
          parsed.clarification = tpl(lang, {
            en: `There are ${resolved.count} suppliers named "${spokenName}". Please look at the list below and select the correct supplier.`,
            ur: `"${spokenName}" نامی ${resolved.count} سپلائر موجود ہیں۔ براہ کرم نیچے دی گئی فہرست میں سے درست سپلائر منتخب کریں۔`,
          });
          pickerNeededRef.current = { kind: 'supplier', mode: 'multiple', spokenName, candidates: [], parsed, lang };
          return null;
        } else if (resolved.kind === 'exact-one') {
          parsed.clarification = tpl(lang, {
            en: `Found an existing supplier named "${spokenName}". Please confirm below.`,
            ur: `"${spokenName}" نامی سپلائر پہلے سے موجود ہے۔ براہ کرم نیچے تصدیق کریں۔`,
          });
          pickerNeededRef.current = { kind: 'supplier', mode: 'confirm-one', spokenName, candidates: [resolved.party], parsed, lang };
          return null;
        } else if (resolved.kind === 'fuzzy') {
          parsed.clarification = tpl(lang, {
            en: `"${spokenName}" is close to an existing name. Please confirm below who you mean.`,
            ur: `"${spokenName}" سے ملتا جلتا نام پہلے سے موجود ہے۔ براہ کرم نیچے تصدیق کریں کہ آپ کس کی بات کر رہے ہیں۔`,
          });
          pickerNeededRef.current = { kind: 'supplier', mode: 'fuzzy', spokenName, candidates: resolved.candidates, parsed, lang };
          return null;
        } else {
          const created = await autoCreateParty('suppliers', 'supplier_name', spokenName);
          if (created) { supplierId = created.id; supplierName = created.name; }
        }
      }
    }
    return { kind: 'purchase', supplierName, supplierId, lines, subtotal, totalTradeOffer, totalFurtherTax, totalAdvanceTax, grandTotal, amountPaid, balance };
  };

  const buildPaymentPreview = async (parsed: ParsedCommand, forcedParty?: { id: string; name: string }, sourceText: string = ''): Promise<PaymentPreview | null> => {
    if (parsed.intent !== 'PAYMENT' || !parsed.entities.payment?.amount) return null;
    const lang = detectReplyLang(sourceText || parsed.entities.customer?.name || '');
    let customerId: string | null = null;
    let customerName = parsed.entities.customer?.name ?? '';
    let previousBalance: number | null = null;
    if (forcedParty) {
      customerId = forcedParty.id; customerName = forcedParty.name;
      previousBalance = (await fetchBalance('customers', forcedParty.id)) ?? null;
    } else if (!parsed.entities.customer?.name && activeContext?.kind === 'customer') {
      customerId = activeContext.id; customerName = activeContext.name;
      previousBalance = (await fetchBalance('customers', activeContext.id)) ?? null;
    } else if (parsed.entities.customer?.name) {
      const spokenName = parsed.entities.customer.name;
      const guard = evaluateDedicatedContext('customer', spokenName);

      if (guard === 'same') {
        customerId = activeContext!.id; customerName = activeContext!.name;
        previousBalance = (await fetchBalance('customers', activeContext!.id)) ?? null;
      } else if (guard === 'near') {
        parsed.clarification = tpl(lang, { en: `Please confirm below.`, ur: `براہ کرم نیچے تصدیق کریں۔` });
        pickerNeededRef.current = {
          kind: 'customer', mode: 'context-typo', spokenName,
          candidates: [{ id: activeContext!.id, name: activeContext!.name }],
          parsed, lang,
        };
        return null;
      } else if (guard === 'different') {
        parsed.clarification = dedicatedBlockMessage(activeContext!.name, 'customer', lang);
        return null;
      } else {
        const resolved = await resolvePartyWithConfirmation('customers', 'full_name', spokenName);
        if (resolved.kind === 'exact-multiple') {
          parsed.clarification = tpl(lang, {
            en: `There are ${resolved.count} customers named "${spokenName}". Please look at the list below and select the correct customer.`,
            ur: `"${spokenName}" نامی ${resolved.count} کسٹمر موجود ہیں۔ براہ کرم نیچے دی گئی فہرست میں سے درست کسٹمر منتخب کریں۔`,
          });
          pickerNeededRef.current = { kind: 'customer', mode: 'multiple', spokenName, candidates: [], parsed, lang };
          return null;
        } else if (resolved.kind === 'exact-one') {
          parsed.clarification = tpl(lang, {
            en: `Found an existing customer named "${spokenName}". Please confirm below.`,
            ur: `"${spokenName}" نامی کسٹمر پہلے سے موجود ہے۔ براہ کرم نیچے تصدیق کریں۔`,
          });
          pickerNeededRef.current = { kind: 'customer', mode: 'confirm-one', spokenName, candidates: [resolved.party], parsed, lang };
          return null;
        } else if (resolved.kind === 'fuzzy') {
          parsed.clarification = tpl(lang, {
            en: `"${spokenName}" is close to an existing name. Please confirm below who you mean.`,
            ur: `"${spokenName}" سے ملتا جلتا نام پہلے سے موجود ہے۔ براہ کرم نیچے تصدیق کریں کہ آپ کس کی بات کر رہے ہیں۔`,
          });
          pickerNeededRef.current = { kind: 'customer', mode: 'fuzzy', spokenName, candidates: resolved.candidates, parsed, lang };
          return null;
        } else {
          // A payment implies an existing relationship — unlike a sale, we
          // do NOT auto-create a brand-new customer just to record a
          // payment from them, since there's no prior invoice to apply it to.
          parsed.clarification = tpl(lang, {
            en: `I don't have a customer named "${spokenName}" yet, so there's no balance to apply a payment to. Please check the spelling, or record a sale for them first.`,
            ur: `"${spokenName}" نامی کوئی کسٹمر موجود نہیں، اس لیے ادائیگی کس کے کھاتے میں لگائیں؟ براہ کرم نام چیک کریں، یا پہلے اس کی سیل ریکارڈ کریں۔`,
          });
          return null;
        }
      }
    }
    const amount = parsed.entities.payment.amount;
    const currency = parsed.entities.payment.currency ?? shop?.currency ?? 'PKR';
    const percentOfTotal = parsed.entities.payment.percent_of_total ?? null;
    const newBalance = previousBalance != null ? Math.max(0, previousBalance - amount) : null;
    return { kind: 'payment', customerName, customerId, amount, currency, percentOfTotal, previousBalance, newBalance };
  };

  const buildPreview = async (parsed: ParsedCommand, sourceText: string = ''): Promise<SalePreview | PurchasePreview | PaymentPreview | null> => {
    if (parsed.intent === 'SALE') return buildSalePreview(parsed, undefined, sourceText);
    if (parsed.intent === 'PURCHASE') return buildPurchasePreview(parsed, undefined, sourceText);
    if (parsed.intent === 'PAYMENT') return buildPaymentPreview(parsed, undefined, sourceText);
    return null;
  };

  // Builds the assistant's reply + preview from an already-parsed command,
  // and appends it to the chat. Shared by the normal AI-parse path and the
  // "yes, create them" resume path (which skips calling the AI again).
  const finishTurn = async (parsed: ParsedCommand, langSourceText: string) => {
    const preview = await buildPreview(parsed, langSourceText);
    const lang = detectReplyLang(langSourceText);
    let responseText = '';

    if (parsed.clarification) {
      responseText = parsed.clarification;
    } else if (parsed.intent === 'SALE' && preview?.kind === 'sale') {
      responseText = tpl(lang, {
        en: `I have prepared a sale preview for ${preview.customerName}. Please review and confirm.`,
        ur: `${preview.customerName} کی سیل تیار کر لی گئی ہے۔ براہِ کرم نیچے دیکھ کر تصدیق کریں۔`,
        hi: `${preview.customerName} के लिए बिक्री तैयार कर दी है। नीचे देख कर पुष्टि करें।`,
      });
    } else if (parsed.intent === 'PURCHASE' && preview?.kind === 'purchase') {
      responseText = tpl(lang, {
        en: `I have prepared a purchase preview from ${preview.supplierName}. Please review and confirm.`,
        ur: `${preview.supplierName} سے خریداری تیار کر لی گئی ہے۔ براہِ کرم نیچے دیکھ کر تصدیق کریں۔`,
        hi: `${preview.supplierName} से खरीद तैयार कर दी है। नीचे देख कर पुष्टि करें।`,
      });
    } else if (parsed.intent === 'PAYMENT' && preview?.kind === 'payment') {
      if (!preview.customerId) {
        responseText = tpl(lang, {
          en: `I could not find a customer named "${preview.customerName || 'that name'}". Please check the name and try again.`,
          ur: `"${preview.customerName || 'اس نام کے'}" کا کوئی کسٹمر نہیں ملا۔ براہِ کرم نام چیک کر کے دوبارہ بتائیں۔`,
          hi: `"${preview.customerName || 'इस नाम के'}" नाम का कोई ग्राहक नहीं मिला। नाम जांच कर दोबारा बताएं।`,
        });
      } else {
        responseText = tpl(lang, {
          en: `I have prepared a payment of ${formatMoney(preview.amount, shop?.currency)} for ${preview.customerName}. Please review and confirm.`,
          ur: `${preview.customerName} کے لیے ${formatMoney(preview.amount, shop?.currency)} ادائیگی تیار کر لی گئی ہے۔ براہِ کرم نیچے دیکھ کر تصدیق کریں۔`,
          hi: `${preview.customerName} के लिए ${formatMoney(preview.amount, shop?.currency)} भुगतान तैयार कर दिया है। नीचे देख कर पुष्टि करें।`,
        });
      }
    } else if (parsed.intent === 'CUSTOMER_SEARCH') {
      const { data } = await supabase.from('customers').select('id, full_name, primary_phone').eq('shop_id', shop!.id).ilike('full_name', `%${parsed.entities.customer?.name ?? ''}%`).limit(5);
      if (data && data.length > 0) {
        const list = data.map((c) => `• ${c.full_name}${c.primary_phone ? ` (${c.primary_phone})` : ''}`).join('\n');
        responseText = tpl(lang, {
          en: `Found ${data.length} customer(s):\n${list}`,
          ur: `${data.length} کسٹمر ملے:\n${list}`,
          hi: `${data.length} ग्राहक मिले:\n${list}`,
        });
      } else {
        responseText = tpl(lang, {
          en: 'No customers found with that name.',
          ur: 'اس نام کا کوئی کسٹمر نہیں ملا۔',
          hi: 'इस नाम का कोई ग्राहक नहीं मिला।',
        });
      }
    } else if (parsed.intent === 'REPORT') {
      responseText = reportResponse(parsed.entities.report_type ?? 'daily_sales', lang);
    } else {
      responseText = tpl(lang, {
        en: 'I did not understand that. Try something like "Ahmed ko 5 kilo cheeni 270 rupay kilo de do".',
        ur: 'یہ سمجھ نہیں آیا۔ کچھ اس طرح آزمائیں: "احمد کو 5 کلو چینی 270 روپے کلو دے دو"۔',
        hi: 'यह समझ नहीं आया। कुछ इस तरह आज़माएं: "अहमद को 5 किलो चीनी 270 रुपए किलो दे दो"।',
      });
    }

    const needsPicker = pickerNeededRef.current ?? undefined;
    pickerNeededRef.current = null;
    const assistantMsg: Message = { id: Math.random().toString(36).slice(2), role: 'assistant', text: responseText, lang: renderLangOf(lang), parsed, preview: preview ?? undefined, needsPicker };
    setMessages((m) => [...m, assistantMsg]);
  };

  // Called when the shopkeeper clicks a customer/supplier inside a picker
  // or confirmation card. Resumes the ORIGINAL paused sale/purchase/payment
  // command using the chosen record, updating the SAME message in place —
  // the chat never closes and no screen change happens.
  const handlePickerSelect = async (msgId: string, needsPicker: PartyPickerState, chosen: PickedParty | ConfirmCandidate) => {
    const resumedParsed: ParsedCommand = { ...needsPicker.parsed, clarification: undefined };
    const lang = needsPicker.lang;

    let preview: SalePreview | PurchasePreview | PaymentPreview | null = null;
    let responseText = '';

    if (resumedParsed.intent === 'PAYMENT') {
      preview = await buildPaymentPreview(resumedParsed, chosen);
      responseText = tpl(lang, {
        en: `Selected ${chosen.name}. I have prepared the payment preview. Please review and confirm.`,
        ur: `${chosen.name} منتخب کر لیا گیا۔ ادائیگی تیار ہے، نیچے دیکھ کر تصدیق کریں۔`,
        hi: `${chosen.name} चुन लिया। भुगतान पूर्वावलोकन तैयार है, नीचे देख कर पुष्टि करें।`,
      });
    } else if (needsPicker.kind === 'customer') {
      preview = await buildSalePreview(resumedParsed, chosen);
      responseText = tpl(lang, {
        en: `Selected ${chosen.name}. I have prepared the invoice. Please review and confirm.`,
        ur: `${chosen.name} منتخب کر لیا گیا۔ انوائس تیار ہے، نیچے دیکھ کر تصدیق کریں۔`,
        hi: `${chosen.name} चुन लिया। इनवॉइस तैयार है, नीचे देख कर पुष्टि करें।`,
      });
    } else {
      preview = await buildPurchasePreview(resumedParsed, chosen);
      responseText = tpl(lang, {
        en: `Selected ${chosen.name}. I have prepared the purchase invoice. Please review and confirm.`,
        ur: `${chosen.name} منتخب کر لیا گیا۔ خریداری کی انوائس تیار ہے، نیچے دیکھ کر تصدیق کریں۔`,
        hi: `${chosen.name} चुन लिया। खरीद इनवॉइस तैयार है, नीचे देख कर पुष्टि करें।`,
      });
    }

    // Update the SAME message: picker/confirm card disappears, preview appears.
    setMessages((m) => m.map((x) => (x.id === msgId ? { ...x, text: responseText, lang: renderLangOf(lang), preview: preview ?? undefined, needsPicker: undefined } : x)));
  };

  // "None of these — add a new person" from a duplicate picker or a
  // confirm/fuzzy card: create the record, then resume exactly like a
  // normal selection.
  const handlePickerAddNew = async (msgId: string, needsPicker: PartyPickerState) => {
    const table = needsPicker.kind === 'customer' ? 'customers' as const : 'suppliers' as const;
    const nameColumn = needsPicker.kind === 'customer' ? 'full_name' as const : 'supplier_name' as const;
    const created = await autoCreateParty(table, nameColumn, needsPicker.spokenName);
    if (!created) {
      toast('error', tpl(needsPicker.lang, {
        en: 'Could not create the new record. Please try again.',
        ur: 'نیا ریکارڈ نہیں بن سکا۔ براہ کرم دوبارہ کوشش کریں۔',
      }));
      return;
    }
    await handlePickerSelect(msgId, needsPicker, created);
  };

  // "No, a different person" on a dedicated chat's context-typo card —
  // falls through to the same block message a clearly-different name
  // would get, with nothing read or written to the database.
  const handlePickerReject = (msgId: string, needsPicker: PartyPickerState) => {
    if (!activeContext) return;
    const lang = needsPicker.lang;
    const text = dedicatedBlockMessage(activeContext.name, needsPicker.kind, lang);
    setMessages((m) => m.map((x) => (x.id === msgId ? { ...x, text, lang: renderLangOf(lang), needsPicker: undefined } : x)));
  };

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userLang = renderLangOf(detectReplyLang(text));

    if (editingId) {
      // The user is correcting a previous message (e.g. adding an item,
      // changing quantity/rate). Replace that message's text and drop
      // everything that came after it (its old AI response/preview),
      // then reprocess the corrected message fresh.
      setMessages((m) => {
        const idx = m.findIndex((x) => x.id === editingId);
        if (idx === -1) return m;
        const kept = m.slice(0, idx);
        return [...kept, { id: editingId, role: 'user' as const, text, lang: userLang }];
      });
      setEditingId(null);
    } else {
      const userMsg: Message = { id: Math.random().toString(36).slice(2), role: 'user', text, lang: userLang };
      setMessages((m) => [...m, userMsg]);
    }
    setInput('');
    setLoading(true);

    try {
      const parsed = await callAI(text);
      await finishTurn(parsed, text);
    } catch (err) {
      const assistantMsg: Message = { id: Math.random().toString(36).slice(2), role: 'assistant', text: `Sorry, I could not process that. ${err instanceof Error ? err.message : 'Please try again.'}` };
      setMessages((m) => [...m, assistantMsg]);
    } finally {
      setLoading(false);
    }
  };

  const confirmSale = async (msg: Message, preview: SalePreview) => {
    if (!shop || !user) return;

    // A brand-new customer's FIRST invoice requires a phone number
    // before it can be saved — this is their primary identifier for
    // future duplicate-name situations.
    if (preview.isNewCustomer) {
      const phone = (phoneDrafts[msg.id] ?? '').trim();
      if (!phone) {
        const lang = detectReplyLang(msg.text);
        toast('error', tpl(lang, {
          en: 'Phone number is required for a new customer.',
          ur: 'نئے کسٹمر کے لیے فون نمبر ضروری ہے۔',
          hi: 'नए ग्राहक के लिए फ़ोन नंबर आवश्यक है।',
        }));
        return;
      }
      if (preview.customerId) {
        const { error: phoneErr } = await supabase.from('customers').update({ primary_phone: phone }).eq('id', preview.customerId);
        if (phoneErr) { toast('error', phoneErr.message); return; }
      }
    }

    setConfirming(msg);
    const items = preview.lines.map((l) => ({ product_id: '', product_name: l.name, unit: l.unit, quantity: l.qty, price: l.price, discount: 0, tax_rate: 0 }));
    const { data, error } = await supabase.rpc('create_sale', {
      p_shop_id: shop.id, p_customer_id: preview.customerId, p_customer_name: preview.customerName,
      p_sale_date: new Date().toISOString(), p_items: items, p_discount_total: preview.discount,
      p_tax_total: 0, p_amount_paid: preview.amountPaid, p_payment_method: 'cash',
      p_notes: 'Created via AI Assistant', p_user_id: user.id,
    });
    setConfirming(null);
    if (error) { toast('error', error.message); return; }
    toast('success', 'Sale confirmed and saved!');
    setPhoneDrafts((d) => { const next = { ...d }; delete next[msg.id]; return next; });
    setMessages((m) => m.map((x) => (x.id === msg.id ? {
      ...x, preview: undefined, text: 'Sale confirmed and saved to the customer ledger.', lang: 'en',
      savedLink: `/sales/${data}`,
      savedAccountLink: preview.customerId ? `/customers/${preview.customerId}` : undefined,
      savedAccountLabel: preview.customerId ? `View ${preview.customerName}'s account` : undefined,
    } : x)));
    // Stay on the AI Assistant page — do NOT navigate away.
  };

  const confirmPurchase = async (msg: Message, preview: PurchasePreview) => {
    if (!shop || !user) return;
    setConfirming(msg);
    const items = preview.lines.map((l) => ({
      product_id: '', product_name: l.name, unit: l.unit,
      ordered_quantity: l.qty, free_units: 0, price_per_unit: l.price,
      regular_discount: 0, special_discount: 0, scheme_discount: 0, additional_discount: 0,
      trade_offer_amount: l.trade_offer_amount ?? 0, tax_amount: 0, tax_rate: 0,
      hs_code: l.hs_code ?? '', supplier_product_code: l.supplier_product_code ?? '',
      ctn_size: l.ctn_size ?? '', retail_price: l.retail_price ?? 0,
      trade_activity: l.trade_activity ?? '', sales_tax_rate: l.sales_tax_rate ?? 0,
      further_tax: l.further_tax ?? 0, advance_tax: l.advance_tax ?? 0, tax_type: l.tax_type ?? '',
    }));
    const { data, error } = await supabase.rpc('create_purchase', {
      p_shop_id: shop.id, p_supplier_id: preview.supplierId, p_supplier_name: preview.supplierName,
      p_supplier_invoice_number: '', p_purchase_date: new Date().toISOString(),
      p_items: items, p_discount_total: 0, p_tax_total: 0,
      p_delivery_charges: 0, p_freight: 0, p_other_charges: 0,
      p_amount_paid: preview.amountPaid, p_payment_method: 'cash',
      p_notes: 'Created via AI Assistant', p_user_id: user.id,
    });
    setConfirming(null);
    if (error) { toast('error', error.message); return; }
    toast('success', 'Purchase confirmed and saved!');
    setMessages((m) => m.map((x) => (x.id === msg.id ? {
      ...x, preview: undefined, text: 'Purchase confirmed and saved to the supplier ledger.', lang: 'en',
      savedLink: `/purchases/${data}`,
      savedAccountLink: preview.supplierId ? `/suppliers/${preview.supplierId}` : undefined,
      savedAccountLabel: preview.supplierId ? `View ${preview.supplierName}'s account` : undefined,
    } : x)));
    // Stay on the AI Assistant page — do NOT navigate away.
  };

  const confirmPayment = async (msg: Message, preview: PaymentPreview) => {
    if (!shop || !user || !preview.customerId) return;
    setConfirming(msg);
    const { data, error } = await supabase.rpc('receive_customer_payment', {
      p_shop_id: shop.id, p_customer_id: preview.customerId, p_amount: preview.amount,
      p_method: 'cash', p_reference: '', p_notes: 'Recorded via AI Assistant', p_user_id: user.id,
    });
    setConfirming(null);
    if (error) { toast('error', error.message); return; }
    toast('success', 'Payment recorded!');
    const newBal = typeof data === 'number' ? data : preview.newBalance;
    setMessages((m) => m.map((x) => (x.id === msg.id ? {
      ...x, preview: undefined, lang: 'en',
      text: newBal != null
        ? `Payment recorded. ${preview.customerName}'s new balance is ${formatMoney(newBal, shop?.currency)}.`
        : 'Payment recorded and added to the customer ledger.',
      savedAccountLink: preview.customerId ? `/customers/${preview.customerId}` : undefined,
      savedAccountLabel: preview.customerId ? `View ${preview.customerName}'s account` : undefined,
    } : x)));
  };

  const confirm = (msg: Message) => {
    if (!msg.preview) return;
    if (msg.preview.kind === 'sale') confirmSale(msg, msg.preview);
    else if (msg.preview.kind === 'purchase') confirmPurchase(msg, msg.preview);
    else if (msg.preview.kind === 'payment') confirmPayment(msg, msg.preview);
  };

  // Discard a preview without saving — stays entirely inside the AI
  // chat. The shopkeeper can just type the corrected command next
  // (e.g. "oil ki quantity 3 kar do") instead of leaving this page.
  const discardPreview = (msg: Message, lang: ReplyLang) => {
    setMessages((m) => m.map((x) => (x.id === msg.id ? {
      ...x, preview: undefined, lang: renderLangOf(lang),
      text: tpl(lang, {
        en: 'Cancelled. Just type the corrected details and I\'ll prepare a new preview.',
        ur: 'منسوخ کر دیا گیا۔ درست تفصیل دوبارہ لکھیں، میں نئی پیش نظر بنا دوں گا۔',
        hi: 'रद्द कर दिया। सही जानकारी दोबारा लिखें, मैं नई प्रीव्यू बना दूंगा।',
      }),
    } : x)));
  };

  // "Edit" on a preview card: find the user message that produced this
  // preview (it's always the message right before this assistant reply)
  // and load it into the input box for editing, exactly like clicking
  // "Edit" on the message bubble itself.
  const editFromPreview = (assistantMsg: Message) => {
    setMessages((m) => {
      const idx = m.findIndex((x) => x.id === assistantMsg.id);
      const userMsg = idx > 0 ? m[idx - 1] : null;
      if (userMsg && userMsg.role === 'user') {
        setEditingId(userMsg.id);
        setInput(userMsg.text);
      }
      return m;
    });
  };

  // Voice input. Browser speech-recognition engines require a fixed
  // language to be set BEFORE listening starts — they cannot detect which
  // language is being spoken and switch mid-stream. The shopkeeper picks
  // their speaking language once via the toggle next to the mic button;
  // it stays selected across messages until changed.
  const toggleVoice = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast('error', 'Voice input is not supported in this browser. Try Chrome or Edge.'); return; }
    const rec = new SR();
    rec.lang = voiceLang; rec.interimResults = false; rec.continuous = false;
    rec.onresult = (e: any) => { const transcript = e.results[0][0].transcript; setInput(transcript); setListening(false); };
    rec.onerror = () => { setListening(false); toast('error', 'Voice recognition failed. Please try again.'); };
    rec.onend = () => setListening(false);
    rec.start(); setListening(true); recognitionRef.current = rec;
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); send(input); };

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4 py-4 md:h-[calc(100vh-0px)] md:px-6 md:py-6">
      <PageHeader title="AI Assistant" subtitle="Speak or type in Urdu or English. I will build the transaction for you." />

      {activeContext && (
        <div className="mb-4 rounded-lg bg-blue-50 px-4 py-2.5 text-sm text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
          <div className="flex items-center justify-between gap-2">
            <p dir="rtl" className="font-medium">
              یہ چیٹ صرف <strong>{activeContext.name}</strong> کے حساب کتاب کے لیے ہے۔
            </p>
            <Link
              to={activeContext.kind === 'customer' ? `/customers/${activeContext.id}` : `/suppliers/${activeContext.id}`}
              className="flex-shrink-0 text-xs font-medium hover:underline"
            >
              Back to {activeContext.kind === 'customer' ? 'Customer' : 'Supplier'} →
            </Link>
          </div>
          <p className="mt-0.5 text-xs opacity-75">
            Chatting about: <strong>{activeContext.name}</strong> ({activeContext.kind === 'customer' ? 'Customer' : 'Supplier'} context active — no need to repeat the name)
          </p>
        </div>
      )}

      <Card className="flex flex-1 flex-col overflow-hidden">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg">
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <p dir="rtl" className="font-semibold text-slate-900 dark:text-slate-100">السلام علیکم! میں ShopPilot AI ہوں۔</p>
                <p dir="rtl" className="mt-1 text-sm text-slate-500 dark:text-slate-400">بس بولیے، حساب سنبھال لوں گا۔</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} dir="rtl" onClick={() => send(s)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-950/30">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                {m.role === 'user' ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}>
                <p dir={m.lang === 'ur' ? 'rtl' : 'ltr'} className={`whitespace-pre-line ${m.lang === 'ur' ? 'text-right' : ''}`}>{m.text}</p>

                {m.role === 'user' && !loading && (
                  <button
                    type="button"
                    onClick={() => { setEditingId(m.id); setInput(m.text); }}
                    className="mt-1 flex items-center gap-1 text-[11px] font-medium text-blue-100 hover:text-white hover:underline"
                  >
                    <Edit className="h-3 w-3" /> Edit
                  </button>
                )}

                {/* Duplicate-name picker — renders directly inside this
                    message bubble, no modal, no screen change. Disappears
                    once a selection is made. */}
                {m.needsPicker?.mode === 'multiple' && shop && (
                  <EmbeddedPartyPicker
                    kind={m.needsPicker.kind}
                    shopId={shop.id}
                    currency={shop.currency}
                    initialSearch={m.needsPicker.spokenName}
                    onSelect={(chosen) => handlePickerSelect(m.id, m.needsPicker!, chosen)}
                    onAddNew={() => handlePickerAddNew(m.id, m.needsPicker!)}
                  />
                )}

                {/* Single-match / near-match / dedicated-chat-typo
                    confirmation card — always requires an explicit human
                    decision before any preview is built. */}
                {(m.needsPicker?.mode === 'confirm-one' || m.needsPicker?.mode === 'fuzzy' || m.needsPicker?.mode === 'context-typo') && (
                  <PartyConfirmCard
                    kind={m.needsPicker.kind}
                    mode={m.needsPicker.mode}
                    spokenName={m.needsPicker.spokenName}
                    candidates={m.needsPicker.candidates}
                    currency={shop?.currency}
                    onSelect={(chosen) => handlePickerSelect(m.id, m.needsPicker!, chosen)}
                    onAddNew={m.needsPicker.mode !== 'context-typo' ? () => handlePickerAddNew(m.id, m.needsPicker!) : undefined}
                    onReject={m.needsPicker.mode === 'context-typo' ? () => handlePickerReject(m.id, m.needsPicker!) : undefined}
                  />
                )}

                {/* Sale preview card */}
                {m.preview?.kind === 'sale' && (() => {
                  const p = m.preview;
                  return (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                        <ShoppingBag className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-semibold">Sale Preview — {p.customerName}</span>
                      </div>

                      {/* Customer summary: name, phone, previous balance — always visible */}
                      <div className="mb-2 space-y-1.5 rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-800/50">
                        <div className="flex justify-between"><span className="text-slate-500">Customer Name</span><span className="font-medium">{p.customerName}</span></div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex-shrink-0 text-slate-500">Phone Number</span>
                          {p.isNewCustomer ? (
                            <input
                              type="tel"
                              placeholder="e.g. 0300XXXXXXX"
                              value={phoneDrafts[m.id] ?? ''}
                              onChange={(e) => setPhoneDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                              className="w-36 rounded border border-amber-300 bg-white px-2 py-1 text-right text-xs focus:border-amber-500 focus:outline-none dark:border-amber-700 dark:bg-slate-900"
                            />
                          ) : (
                            <span className="font-medium">{p.customerPhone || '—'}</span>
                          )}
                        </div>
                        {p.isNewCustomer && (
                          <p className="text-right text-[10px] text-amber-600 dark:text-amber-400">
                            Phone number is required for customer identification.
                          </p>
                        )}
                        <div className="flex justify-between"><span className="text-slate-500">Previous Balance</span><span className="font-medium">{formatMoney(p.previousBalance, shop?.currency)}</span></div>
                      </div>

                      <div className="space-y-1">
                        {p.lines.map((l, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span>{l.qty} {l.unit} {l.name} @ {formatMoney(l.price, l.currency)}{l.currency !== (shop?.currency ?? 'PKR') ? ` (${l.currency})` : ''}</span>
                            <span className="font-medium">{formatMoney(l.total, l.currency)}</span>
                          </div>
                        ))}
                      </div>
                      {p.currencyWarning && (
                        <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                          ⚠ {p.currencyWarning}
                        </div>
                      )}
                      <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
                        <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(p.subtotal, shop?.currency)}</span></div>
                        {p.discount > 0 && <div className="flex justify-between text-amber-600"><span>Discount</span><span>-{formatMoney(p.discount, shop?.currency)}</span></div>}
                        <div className="flex justify-between font-semibold"><span>Total</span><span>{formatMoney(p.grandTotal, shop?.currency)}</span></div>
                        <div className="flex justify-between text-emerald-600">
                          <span>Paid{p.paymentPercent != null ? ` (${p.paymentPercent}%)` : ''}</span>
                          <span>{formatMoney(p.amountPaid, shop?.currency)}</span>
                        </div>
                        {p.balance > 0 && <div className="flex justify-between text-amber-600"><span>Balance (credit)</span><span>{formatMoney(p.balance, shop?.currency)}</span></div>}
                        <div className="flex justify-between border-t border-slate-100 pt-1 font-semibold dark:border-slate-800">
                          <span>Updated Balance</span>
                          <span>{formatMoney(p.previousBalance + p.balance, shop?.currency)}</span>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" onClick={() => confirm(m)} loading={confirming?.id === m.id}>
                          <Check className="h-4 w-4" /> Confirm
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => editFromPreview(m)}>
                          <Edit className="h-4 w-4" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => discardPreview(m, detectReplyLang(m.text))}>
                          <X className="h-4 w-4" /> Cancel
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                {/* Purchase preview card */}
                {m.preview?.kind === 'purchase' && (() => {
                  const p = m.preview;
                  return (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                        <Package className="h-4 w-4 text-amber-600" />
                        <span className="text-sm font-semibold">Purchase Preview — {p.supplierName}</span>
                      </div>
                      <div className="space-y-2">
                        {p.lines.map((l, i) => (
                          <div key={i} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium">{l.qty} {l.unit} {l.name} @ {formatMoney(l.price, shop?.currency)}</span>
                              <span className="font-medium">{formatMoney(l.total, shop?.currency)}</span>
                            </div>
                            {/* FMCG fields */}
                            {(l.hs_code || l.supplier_product_code || l.ctn_size || l.retail_price || l.trade_offer_amount || l.trade_activity || l.sales_tax_rate || l.further_tax || l.advance_tax || l.tax_type) && (
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                {l.hs_code && <span>HS: {l.hs_code}</span>}
                                {l.supplier_product_code && <span>Code: {l.supplier_product_code}</span>}
                                {l.ctn_size && <span>CTN: {l.ctn_size}</span>}
                                {l.retail_price != null && <span>Retail: {formatMoney(l.retail_price, shop?.currency)}</span>}
                                {l.trade_offer_amount != null && <span>Trade Offer: -{formatMoney(l.trade_offer_amount, shop?.currency)}</span>}
                                {l.trade_activity && <span>Activity: {l.trade_activity}</span>}
                                {l.sales_tax_rate != null && <span>Tax%: {l.sales_tax_rate}%</span>}
                                {l.further_tax != null && <span>Further Tax: {formatMoney(l.further_tax, shop?.currency)}</span>}
                                {l.advance_tax != null && <span>Advance Tax: {formatMoney(l.advance_tax, shop?.currency)}</span>}
                                {l.tax_type && <span>Type: {l.tax_type}</span>}
                              </div>
                            )}
                            <div className="mt-0.5 flex justify-between text-[11px] font-medium text-slate-600 dark:text-slate-300">
                              <span>Net</span>
                              <span>{formatMoney(l.netAmount, shop?.currency)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
                        <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(p.subtotal, shop?.currency)}</span></div>
                        {p.totalTradeOffer > 0 && <div className="flex justify-between text-amber-600"><span>Trade Offer</span><span>-{formatMoney(p.totalTradeOffer, shop?.currency)}</span></div>}
                        {p.totalFurtherTax > 0 && <div className="flex justify-between"><span>Further Tax</span><span>+{formatMoney(p.totalFurtherTax, shop?.currency)}</span></div>}
                        {p.totalAdvanceTax > 0 && <div className="flex justify-between"><span>Advance Tax</span><span>+{formatMoney(p.totalAdvanceTax, shop?.currency)}</span></div>}
                        <div className="flex justify-between font-semibold"><span>Grand Total</span><span>{formatMoney(p.grandTotal, shop?.currency)}</span></div>
                        {p.amountPaid > 0 && <div className="flex justify-between text-emerald-600"><span>Paid</span><span>{formatMoney(p.amountPaid, shop?.currency)}</span></div>}
                        {p.balance > 0 && <div className="flex justify-between text-amber-600"><span>Balance Payable</span><span>{formatMoney(p.balance, shop?.currency)}</span></div>}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" onClick={() => confirm(m)} loading={confirming?.id === m.id}>
                          <Check className="h-4 w-4" /> Confirm
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => editFromPreview(m)}>
                          <Edit className="h-4 w-4" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => discardPreview(m, detectReplyLang(m.text))}>
                          <X className="h-4 w-4" /> Cancel
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                {/* Payment preview card */}
                {m.preview?.kind === 'payment' && (() => {
                  const p = m.preview;
                  return (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                        <Wallet className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm font-semibold">Payment Preview — {p.customerName}</span>
                      </div>
                      <div className="space-y-0.5 text-xs">
                        {p.previousBalance != null && (
                          <div className="flex justify-between"><span>Previous balance</span><span>{formatMoney(p.previousBalance, shop?.currency)}</span></div>
                        )}
                        <div className="flex justify-between font-semibold">
                          <span>Amount received{p.percentOfTotal != null ? ` (${p.percentOfTotal}%)` : ''}</span>
                          <span>{formatMoney(p.amount, p.currency)}</span>
                        </div>
                        {p.newBalance != null && (
                          <div className="flex justify-between text-emerald-600"><span>New balance</span><span>{formatMoney(p.newBalance, shop?.currency)}</span></div>
                        )}
                      </div>
                      {p.customerId ? (
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" onClick={() => confirm(m)} loading={confirming?.id === m.id}>
                            <Check className="h-4 w-4" /> Confirm
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => editFromPreview(m)}>
                            <Edit className="h-4 w-4" /> Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => discardPreview(m, detectReplyLang(m.text))}>
                            <X className="h-4 w-4" /> Cancel
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-amber-600">Customer not found — cannot confirm. Please check the name.</p>
                      )}
                    </div>
                  );
                })()}

                {/* Links shown after confirming — never auto-navigates away. Two links prove
                    the transaction was recorded BOTH as an invoice AND in the correct
                    customer/supplier account (not just the general Sales/Purchases list). */}
                <div className="mt-2 flex flex-wrap gap-3">
                  {m.savedLink && (
                    <button
                      onClick={() => navigate(m.savedLink!)}
                      className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      View invoice →
                    </button>
                  )}
                  {m.savedAccountLink && (
                    <button
                      onClick={() => navigate(m.savedAccountLink!)}
                      className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      {m.savedAccountLabel ?? 'View account'} →
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <Sparkles className="h-4 w-4 text-slate-400 animate-pulse" />
              </div>
              <div className="flex items-center gap-1 rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800">
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={onSubmit} className="border-t border-slate-100 p-3 dark:border-slate-800">
          {editingId && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
              <span>Editing your previous message — update it below, then send.</span>
              <button type="button" onClick={() => { setEditingId(null); setInput(''); }} className="font-medium hover:underline">
                Cancel edit
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleVoice}
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                listening ? 'bg-red-100 text-red-600 animate-pulse dark:bg-red-950/50' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
              }`}
              title={listening ? 'Stop' : 'Voice input'}
            >
              {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <div className="flex flex-shrink-0 overflow-hidden rounded-full border border-slate-200 text-[10px] font-medium dark:border-slate-700" title="Voice input language">
              {(['ur-PK', 'en-PK', 'hi-IN'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setVoiceLang(code)}
                  className={`px-2 py-1.5 transition-colors ${voiceLang === code ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400'}`}
                >
                  {code === 'ur-PK' ? 'اردو' : code === 'en-PK' ? 'EN' : 'हिं'}
                </button>
              ))}
            </div>
            <Input
              placeholder={listening ? 'Listening...' : 'Type a command in Urdu or English...'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function reportResponse(type: string, lang: ReplyLang = 'en'): string {
  const map: Record<string, { en: string; ur: string; hi: string }> = {
    daily_sales: {
      en: "Opening the daily sales report. Please check the Sales page for today's invoices.",
      ur: 'آج کی سیلز رپورٹ کے لیے سیلز پیج دیکھیں۔',
      hi: 'आज की सेल्स रिपोर्ट के लिए सेल्स पेज देखें।',
    },
    monthly_sales: {
      en: "Opening the monthly sales report. Please check the Sales page for this month's invoices.",
      ur: 'اس مہینے کی سیلز رپورٹ کے لیے سیلز پیج دیکھیں۔',
      hi: 'इस महीने की सेल्स रिपोर्ट के लिए सेल्स पेज देखें।',
    },
    expenses: {
      en: 'Opening the expenses report. Please check the Expenses page.',
      ur: 'اخراجات کی رپورٹ کے لیے ایکسپینسز پیج دیکھیں۔',
      hi: 'खर्चों की रिपोर्ट के लिए एक्सपेंसेस पेज देखें।',
    },
    profit: {
      en: 'Profit is calculated as sales minus purchases and expenses. Visit the Dashboard for a summary.',
      ur: 'منافع = سیل مائنس خریداری مائنس اخراجات۔ ڈیش بورڈ پر خلاصہ دیکھیں۔',
      hi: 'मुनाफ़ा = बिक्री माइनस खरीद माइनस खर्च। डैशबोर्ड पर सारांश देखें।',
    },
    customer_balances: {
      en: 'Opening customer balances. Please check the Customers page.',
      ur: 'گاہکوں کے بیلنس کے لیے کسٹمرز پیج دیکھیں۔',
      hi: 'ग्राहकों के बैलेंस के लिए कस्टमर्स पेज देखें।',
    },
    inventory: {
      en: 'Opening inventory. Please check the Products page for stock levels.',
      ur: 'اسٹاک دیکھنے کے لیے پروڈکٹس پیج دیکھیں۔',
      hi: 'स्टॉक देखने के लिए प्रोडक्ट्स पेज देखें।',
    },
  };
  const entry = map[type] ?? map.daily_sales;
  return tpl(lang, entry);
}
