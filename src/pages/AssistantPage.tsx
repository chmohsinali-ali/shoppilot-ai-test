import { useEffect, useRef, useState, FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Sparkles, Mic, Send, MicOff, Check, X, Edit, User, ShoppingBag,
  TrendingUp, Search, Wallet, AlertCircle, Package,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { EmbeddedPartyPicker, PickedParty } from '@/components/EmbeddedPartyPicker';
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

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  parsed?: ParsedCommand;
  preview?: SalePreview | PurchasePreview | PaymentPreview;
  savedLink?: string;
  savedAccountLink?: string;
  savedAccountLabel?: string;
  needsPicker?: { kind: 'customer' | 'supplier'; spokenName: string; parsed: ParsedCommand; lang: ReplyLang };
};

// Very lightweight language detection so the assistant's templated
// replies match the language the shopkeeper is typing in. This is not
// perfect linguistic detection — it only needs to distinguish Urdu
// script, common Roman Urdu words, and plain English well enough for
// short shop commands.
type ReplyLang = 'ur' | 'roman' | 'hi' | 'en';

function detectReplyLang(text: string): ReplyLang {
  if (/[\u0900-\u097F]/.test(text)) return 'hi'; // contains Devanagari (Hindi) script
  if (/[\u0600-\u06FF]/.test(text)) return 'ur'; // contains Urdu/Arabic script
  const romanUrduWords = /\b(ko|de|do|ka|ki|ke|hai|hain|rupay|kilo|kharido|becha|diya|diye|khate|mein|kar|karo|kitna|dikhao|bhi)\b/i;
  if (romanUrduWords.test(text)) return 'roman';
  return 'en';
}

function tpl(lang: ReplyLang, strings: { en: string; roman: string; ur: string; hi?: string }, name?: string): string {
  // For Urdu/Roman-Urdu input, show BOTH Roman Urdu and real Urdu script
  // together, so shopkeepers who can't read Roman Urdu (but can read
  // Urdu script) can still understand the confirmation heading, and
  // vice versa. Hindi input shows English on top, Hindi (Devanagari)
  // below, per request. English input gets a plain English reply only.
  //
  // IMPORTANT: the name is always placed BEFORE the sentence, on its
  // own, rather than embedded in the middle of it. Mixing a Latin-script
  // name into the middle of an RTL Urdu sentence causes the browser's
  // bidi algorithm to visually reorder the text in a confusing way. The
  // "roman"/"ur"/"hi" strings passed in should be name-free sentences.
  if (lang === 'hi') {
    const prefix = name ? `${name} — ` : '';
    return `${prefix}${strings.en}\n${prefix}${strings.hi ?? strings.en}`;
  }
  if (lang === 'ur' || lang === 'roman') {
    const prefix = name ? `${name} — ` : '';
    return `${prefix}${strings.roman}\n${prefix}${strings.ur}`;
  }
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
  'Ahmed ko 5 kilo cheeni 270 rupay kilo de do, 2000 rupay diye',
  'Ali ka balance kitna hai?',
  'Aaj ki sale dikhao',
  'Ahmed ne 5000 rupay diye',
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
  const [confirming, setConfirming] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // When a spoken name matches MULTIPLE real customers/suppliers (e.g.
  // two different people both named "Hamza"), buildSalePreview/etc set
  // this ref so finishTurn() can attach an embedded picker to the
  // assistant's reply message. Using a ref (not state) because it's set
  // synchronously during preview-building and read immediately after in
  // the same turn — no re-render needed for it specifically.
  const pickerNeededRef = useRef<{ kind: 'customer' | 'supplier'; spokenName: string; parsed: ParsedCommand; lang: ReplyLang } | null>(null);

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

  // Resolve a spoken name (e.g. "Hamza") against customers/suppliers,
  // using ONLY exact name equality (case-insensitive) — substring
  // matches are intentionally ignored (that was the old bug: "Ali" is a
  // substring of "Mohsin Ali", so a "%Ali%" search wrongly treated
  // "Mohsin Ali" as if it were "Ali").
  //
  // Three outcomes:
  //  - Zero exact matches -> null. Caller should treat this as a brand
  //    new person and create them automatically, no question asked.
  //  - Exactly one exact match -> use it directly, no question asked.
  //  - Two or more exact matches (multiple real customers/suppliers who
  //    happen to share the same name) -> genuinely ambiguous. Caller
  //    should ask which one, showing an identifying detail (last
  //    invoice date/amount, current balance) for each so the shopkeeper
  //    can tell them apart.
  const resolveParty = async (
    table: 'customers' | 'suppliers', nameColumn: 'full_name' | 'supplier_name', name: string
  ): Promise<{ id: string; name: string } | { multiple: number } | null> => {
    const { data: matches, count } = await supabase.from(table).select(`id, ${nameColumn}`, { count: 'exact' }).eq('shop_id', shop!.id).ilike(nameColumn, name);
    if (!matches || matches.length === 0) return null;
    if (matches.length === 1) return { id: (matches[0] as any).id, name: (matches[0] as any)[nameColumn] };
    // Multiple people share this exact name. Don't fetch per-row detail
    // here — the EmbeddedPartyPicker fetches everything it needs in one
    // efficient, paginated query via the directory view.
    return { multiple: count ?? matches.length };
  };

  // Create a brand-new customer/supplier record automatically when a
  // spoken name has ZERO exact matches — per the shopkeeper's request,
  // the AI should not stop to ask permission for this; it should just
  // create the record and continue straight to the invoice preview.
  const autoCreateParty = async (table: 'customers' | 'suppliers', nameColumn: 'full_name' | 'supplier_name', name: string): Promise<{ id: string; name: string } | null> => {
    const { data, error } = await supabase.from(table).insert({ shop_id: shop!.id, [nameColumn]: name, status: 'active' } as any).select('id').single();
    if (error || !data) return null;
    return { id: (data as any).id, name };
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
      const resolved = await resolveParty('customers', 'full_name', spokenName);
      if (resolved && 'multiple' in resolved) {
        parsed.clarification = tpl(detectReplyLang(sourceText || spokenName), {
          en: `There are ${resolved.multiple} customers named "${spokenName}". Please look at the list below and select the correct customer by phone number or name. As soon as you click the correct ${spokenName}, I will prepare the invoice for that customer — then you just need to Confirm and Save.`,
          roman: `"${spokenName}" naam ke ${resolved.multiple} customer maujood hain. Neeche di gayi list mein se phone number ya naam dekh kar sahi customer chunein. Jaise hi aap sahi ${spokenName} par click karein ge, main usi customer ke liye invoice taiyar kar doon ga, phir aap sirf Confirm kar ke Save kar dein.`,
          ur: `نام کے ${resolved.multiple} کسٹمر موجود ہیں۔ براہ کرم نیچے دی گئی فہرست میں سے فون نمبر یا نام دیکھ کر درست کسٹمر منتخب کریں۔ جیسے ہی آپ درست پر کلک کریں گے، میں اسی کسٹمر کے لیے انوائس تیار کر دوں گا، پھر آپ صرف Confirm کر کے Save کر دیں۔`,
          hi: `"${spokenName}" नाम के ${resolved.multiple} ग्राहक मौजूद हैं। कृपया नीचे दी गई सूची में से फ़ोन नंबर या नाम देख कर सही ग्राहक चुनें। जैसे ही आप सही ${spokenName} पर क्लिक करेंगे, मैं उसी ग्राहक के लिए इनवॉइस तैयार कर दूंगा, फिर आप सिर्फ़ Confirm कर के Save कर दें।`,
        }, spokenName);
        pickerNeededRef.current = { kind: 'customer', spokenName, parsed, lang: detectReplyLang(sourceText || spokenName) };
        return null;
      } else if (resolved) {
        customerId = resolved.id; customerName = resolved.name;
      } else {
        // No exact match at all — this is a genuinely new person.
        // Create them automatically and continue straight to the
        // invoice preview, no question asked.
        const created = await autoCreateParty('customers', 'full_name', spokenName);
        if (created) { customerId = created.id; customerName = created.name; }
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
    let supplierId: string | null = null;
    let supplierName = parsed.entities.supplier?.name ?? 'Unknown Supplier';
    if (forcedParty) {
      supplierId = forcedParty.id; supplierName = forcedParty.name;
    } else if (!parsed.entities.supplier?.name && activeContext?.kind === 'supplier') {
      supplierId = activeContext.id; supplierName = activeContext.name;
    } else if (parsed.entities.supplier?.name) {
      const spokenName = parsed.entities.supplier.name;
      const resolved = await resolveParty('suppliers', 'supplier_name', spokenName);
      if (resolved && 'multiple' in resolved) {
        parsed.clarification = tpl(detectReplyLang(sourceText || spokenName), {
          en: `There are ${resolved.multiple} suppliers named "${spokenName}". Please look at the list below and select the correct supplier by phone number or name. As soon as you click the correct ${spokenName}, I will prepare the purchase for that supplier — then you just need to Confirm and Save.`,
          roman: `"${spokenName}" naam ke ${resolved.multiple} supplier maujood hain. Neeche di gayi list mein se phone number ya naam dekh kar sahi supplier chunein. Jaise hi aap sahi ${spokenName} par click karein ge, main usi supplier ke liye purchase taiyar kar doon ga, phir aap sirf Confirm kar ke Save kar dein.`,
          ur: `نام کے ${resolved.multiple} سپلائر موجود ہیں۔ براہ کرم نیچے دی گئی فہرست میں سے فون نمبر یا نام دیکھ کر درست سپلائر منتخب کریں۔ جیسے ہی آپ درست پر کلک کریں گے، میں اسی سپلائر کے لیے خریداری تیار کر دوں گا، پھر آپ صرف Confirm کر کے Save کر دیں۔`,
          hi: `"${spokenName}" नाम के ${resolved.multiple} सप्लायर मौजूद हैं। कृपया नीचे दी गई सूची में से फ़ोन नंबर या नाम देख कर सही सप्लायर चुनें। जैसे ही आप सही ${spokenName} पर क्लिक करेंगे, मैं उसी सप्लायर के लिए खरीद तैयार कर दूंगा, फिर आप सिर्फ़ Confirm कर के Save कर दें।`,
        }, spokenName);
        pickerNeededRef.current = { kind: 'supplier', spokenName, parsed, lang: detectReplyLang(sourceText || spokenName) };
        return null;
      } else if (resolved) {
        supplierId = resolved.id; supplierName = resolved.name;
      } else {
        const created = await autoCreateParty('suppliers', 'supplier_name', spokenName);
        if (created) { supplierId = created.id; supplierName = created.name; }
      }
    }
    return { kind: 'purchase', supplierName, supplierId, lines, subtotal, totalTradeOffer, totalFurtherTax, totalAdvanceTax, grandTotal, amountPaid, balance };
  };

  const buildPaymentPreview = async (parsed: ParsedCommand, forcedParty?: { id: string; name: string }, sourceText: string = ''): Promise<PaymentPreview | null> => {
    if (parsed.intent !== 'PAYMENT' || !parsed.entities.payment?.amount) return null;
    let customerId: string | null = null;
    let customerName = parsed.entities.customer?.name ?? '';
    let previousBalance: number | null = null;
    if (forcedParty) {
      customerId = forcedParty.id; customerName = forcedParty.name;
      const { data: bal } = await supabase.rpc('get_customer_balance', { p_customer_id: forcedParty.id });
      previousBalance = typeof bal === 'number' ? bal : null;
    } else if (!parsed.entities.customer?.name && activeContext?.kind === 'customer') {
      customerId = activeContext.id; customerName = activeContext.name;
      const { data: bal } = await supabase.rpc('get_customer_balance', { p_customer_id: activeContext.id });
      previousBalance = typeof bal === 'number' ? bal : null;
    } else if (parsed.entities.customer?.name) {
      const spokenName = parsed.entities.customer.name;
      const resolved = await resolveParty('customers', 'full_name', spokenName);
      if (resolved && 'multiple' in resolved) {
        parsed.clarification = tpl(detectReplyLang(sourceText || spokenName), {
          en: `There are ${resolved.multiple} customers named "${spokenName}". Please look at the list below and select the correct customer by phone number or name. As soon as you click the correct ${spokenName}, I will prepare the payment for that customer — then you just need to Confirm and Save.`,
          roman: `"${spokenName}" naam ke ${resolved.multiple} customer maujood hain. Neeche di gayi list mein se phone number ya naam dekh kar sahi customer chunein. Jaise hi aap sahi ${spokenName} par click karein ge, main usi customer ke liye payment taiyar kar doon ga, phir aap sirf Confirm kar ke Save kar dein.`,
          ur: `نام کے ${resolved.multiple} کسٹمر موجود ہیں۔ براہ کرم نیچے دی گئی فہرست میں سے فون نمبر یا نام دیکھ کر درست کسٹمر منتخب کریں۔ جیسے ہی آپ درست پر کلک کریں گے، میں اسی کسٹمر کے لیے ادائیگی تیار کر دوں گا، پھر آپ صرف Confirm کر کے Save کر دیں۔`,
          hi: `"${spokenName}" नाम के ${resolved.multiple} ग्राहक मौजूद हैं। कृपया नीचे दी गई सूची में से फ़ोन नंबर या नाम देख कर सही ग्राहक चुनें। जैसे ही आप सही ${spokenName} पर क्लिक करेंगे, मैं उसी ग्राहक के लिए भुगतान तैयार कर दूंगा, फिर आप सिर्फ़ Confirm कर के Save कर दें।`,
        }, spokenName);
        pickerNeededRef.current = { kind: 'customer', spokenName, parsed, lang: detectReplyLang(sourceText || spokenName) };
        return null;
      } else if (resolved) {
        customerId = resolved.id;
        customerName = resolved.name;
        const { data: bal } = await supabase.rpc('get_customer_balance', { p_customer_id: resolved.id });
        previousBalance = typeof bal === 'number' ? bal : null;
      } else {
        // A payment implies an existing relationship — unlike a sale, we
        // do NOT auto-create a brand-new customer just to record a
        // payment from them, since there's no prior invoice to apply it to.
        parsed.clarification = `I don't have a customer named "${spokenName}" yet, so there's no balance to apply a payment to. Please check the spelling, or record a sale for them first.`;
        return null;
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
        roman: `sale taiyar kar di hai. Neeche dekh kar confirm kar dein.`,
        ur: `سیل تیار کر لی ہے۔ نیچے دیکھ کر تصدیق کریں۔`,
        hi: `बिक्री तैयार कर दी है। नीचे देख कर पुष्टि करें।`,
      }, preview.customerName);
    } else if (parsed.intent === 'PURCHASE' && preview?.kind === 'purchase') {
      responseText = tpl(lang, {
        en: `I have prepared a purchase preview from ${preview.supplierName}. Please review and confirm.`,
        roman: `se purchase taiyar kar di hai. Neeche dekh kar confirm kar dein.`,
        ur: `سے خریداری تیار کر لی ہے۔ نیچے دیکھ کر تصدیق کریں۔`,
        hi: `से खरीद तैयार कर दी है। नीचे देख कर पुष्टि करें।`,
      }, preview.supplierName);
    } else if (parsed.intent === 'PAYMENT' && preview?.kind === 'payment') {
      if (!preview.customerId) {
        responseText = tpl(lang, {
          en: `I could not find a customer named "${preview.customerName || 'that name'}". Please check the name and try again.`,
          roman: `ka customer nahi mila. Naam check kar ke dobara batayein.`,
          ur: `کا کوئی گاہک نہیں ملا۔ نام چیک کر کے دوبارہ بتائیں۔`,
          hi: `नाम का कोई ग्राहक नहीं मिला। नाम जांच कर दोबारा बताएं।`,
        }, preview.customerName || undefined);
      } else {
        responseText = tpl(lang, {
          en: `I have prepared a payment of ${formatMoney(preview.amount, shop?.currency)} for ${preview.customerName}. Please review and confirm.`,
          roman: `ke liye ${formatMoney(preview.amount, shop?.currency)} payment taiyar kar di hai. Neeche dekh kar confirm kar dein.`,
          ur: `کے لیے ${formatMoney(preview.amount, shop?.currency)} ادائیگی تیار کر لی ہے۔ نیچے دیکھ کر تصدیق کریں۔`,
          hi: `के लिए ${formatMoney(preview.amount, shop?.currency)} भुगतान तैयार कर दिया है। नीचे देख कर पुष्टि करें।`,
        }, preview.customerName);
      }
    } else if (parsed.intent === 'CUSTOMER_SEARCH') {
      const { data } = await supabase.from('customers').select('id, full_name, primary_phone').eq('shop_id', shop!.id).ilike('full_name', `%${parsed.entities.customer?.name ?? ''}%`).limit(5);
      if (data && data.length > 0) {
        const list = data.map((c) => `• ${c.full_name}${c.primary_phone ? ` (${c.primary_phone})` : ''}`).join('\n');
        responseText = tpl(lang, {
          en: `Found ${data.length} customer(s):\n${list}`,
          roman: `${data.length} customer mile:\n${list}`,
          ur: `${data.length} گاہک ملے:\n${list}`,
          hi: `${data.length} ग्राहक मिले:\n${list}`,
        });
      } else {
        responseText = tpl(lang, {
          en: 'No customers found with that name.',
          roman: 'Is naam ka koi customer nahi mila.',
          ur: 'اس نام کا کوئی گاہک نہیں ملا۔',
          hi: 'इस नाम का कोई ग्राहक नहीं मिला।',
        });
      }
    } else if (parsed.intent === 'REPORT') {
      responseText = reportResponse(parsed.entities.report_type ?? 'daily_sales', lang);
    } else {
      responseText = tpl(lang, {
        en: 'I did not understand that. Try something like "Ahmed ko 5 kilo cheeni 270 rupay kilo de do".',
        roman: 'Ye samajh nahi aaya. Kuch is tarah try karein: "Ahmed ko 5 kilo cheeni 270 rupay kilo de do".',
        ur: 'یہ سمجھ نہیں آیا۔ کچھ اس طرح آزمائیں: "احمد کو 5 کلو چینی 270 روپے کلو دے دو"۔',
        hi: 'यह समझ नहीं आया। कुछ इस तरह आज़माएं: "अहमद को 5 किलो चीनी 270 रुपए किलो दे दो"।',
      });
    }

    const needsPicker = pickerNeededRef.current ?? undefined;
    pickerNeededRef.current = null;
    const assistantMsg: Message = { id: Math.random().toString(36).slice(2), role: 'assistant', text: responseText, parsed, preview: preview ?? undefined, needsPicker };
    setMessages((m) => [...m, assistantMsg]);
  };

  // Called when the shopkeeper clicks a customer/supplier inside the
  // embedded picker. Resumes the ORIGINAL paused sale/purchase/payment
  // command using the chosen record, updating the SAME message in place
  // (picker disappears, invoice preview appears) — the chat never
  // closes and no screen change happens.
  const handlePickerSelect = async (msgId: string, needsPicker: NonNullable<Message['needsPicker']>, chosen: PickedParty) => {
    const resumedParsed: ParsedCommand = { ...needsPicker.parsed, clarification: undefined };
    const lang = needsPicker.lang;

    let preview: SalePreview | PurchasePreview | PaymentPreview | null = null;
    let responseText = '';

    if (resumedParsed.intent === 'PAYMENT') {
      preview = await buildPaymentPreview(resumedParsed, chosen);
      responseText = tpl(lang, {
        en: `Selected ${chosen.name}. I have prepared the payment preview. Please review and confirm.`,
        roman: `${chosen.name} select kar liya. Payment preview taiyar hai, neeche dekh kar confirm karein.`,
        ur: `${chosen.name} منتخب کر لیا۔ ادائیگی پیش نظر تیار ہے، نیچے دیکھ کر تصدیق کریں۔`,
        hi: `${chosen.name} चुन लिया। भुगतान पूर्वावलोकन तैयार है, नीचे देख कर पुष्टि करें।`,
      }, chosen.name);
    } else if (needsPicker.kind === 'customer') {
      preview = await buildSalePreview(resumedParsed, chosen);
      responseText = tpl(lang, {
        en: `Selected ${chosen.name}. I have prepared the invoice. Please review and confirm.`,
        roman: `${chosen.name} select kar liya. Invoice taiyar hai, neeche dekh kar confirm karein.`,
        ur: `${chosen.name} منتخب کر لیا۔ انوائس تیار ہے، نیچے دیکھ کر تصدیق کریں۔`,
        hi: `${chosen.name} चुन लिया। इनवॉइस तैयार है, नीचे देख कर पुष्टि करें।`,
      }, chosen.name);
    } else {
      preview = await buildPurchasePreview(resumedParsed, chosen);
      responseText = tpl(lang, {
        en: `Selected ${chosen.name}. I have prepared the purchase invoice. Please review and confirm.`,
        roman: `${chosen.name} select kar liya. Purchase invoice taiyar hai, neeche dekh kar confirm karein.`,
        ur: `${chosen.name} منتخب کر لیا۔ خریداری کی انوائس تیار ہے، نیچے دیکھ کر تصدیق کریں۔`,
        hi: `${chosen.name} चुन लिया। खरीद इनवॉइस तैयार है, नीचे देख कर पुष्टि करें।`,
      }, chosen.name);
    }

    // Update the SAME message: picker disappears, preview appears.
    setMessages((m) => m.map((x) => (x.id === msgId ? { ...x, text: responseText, preview: preview ?? undefined, needsPicker: undefined } : x)));
  };

  const send = async (text: string) => {
    if (!text.trim() || loading) return;

    if (editingId) {
      // The user is correcting a previous message (e.g. adding an item,
      // changing quantity/rate). Replace that message's text and drop
      // everything that came after it (its old AI response/preview),
      // then reprocess the corrected message fresh.
      setMessages((m) => {
        const idx = m.findIndex((x) => x.id === editingId);
        if (idx === -1) return m;
        const kept = m.slice(0, idx);
        return [...kept, { id: editingId, role: 'user' as const, text }];
      });
      setEditingId(null);
    } else {
      const userMsg: Message = { id: Math.random().toString(36).slice(2), role: 'user', text };
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
          roman: 'Naye customer ke liye phone number zaroori hai.',
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
      ...x, preview: undefined, text: 'Sale confirmed and saved to the customer ledger.',
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
      ...x, preview: undefined, text: 'Purchase confirmed and saved to the supplier ledger.',
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
      ...x, preview: undefined,
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
      ...x, preview: undefined,
      text: tpl(lang, {
        en: 'Cancelled. Just type the corrected details and I\'ll prepare a new preview.',
        roman: 'Cancel kar diya. Sahi tafseel dobara type kar dein, main nayi preview bana doon ga.',
        ur: 'منسوخ کر دیا۔ درست تفصیل دوبارہ لکھیں، میں نئی پیش نظر بنا دوں گا۔',
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

  // Voice input
  const toggleVoice = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast('error', 'Voice input is not supported in this browser. Try Chrome or Edge.'); return; }
    const rec = new SR();
    rec.lang = 'en-PK'; rec.interimResults = false; rec.continuous = false;
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
        <div className="mb-4 flex items-center justify-between rounded-lg bg-blue-50 px-4 py-2.5 text-sm text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
          <span>
            Chatting about: <strong>{activeContext.name}</strong>
            <span className="ml-1 text-xs opacity-75">({activeContext.kind === 'customer' ? 'Customer' : 'Supplier'} context active — no need to repeat the name)</span>
          </span>
          <Link
            to={activeContext.kind === 'customer' ? `/customers/${activeContext.id}` : `/suppliers/${activeContext.id}`}
            className="flex-shrink-0 text-xs font-medium hover:underline"
          >
            Back to {activeContext.kind === 'customer' ? 'Customer' : 'Supplier'} →
          </Link>
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
                <p className="font-semibold text-slate-900 dark:text-slate-100">Salam! Main ShopPilot AI hoon.</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Bas boliye, hisaab sambhal lega.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-950/30">
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
                <p className="whitespace-pre-line">{m.text}</p>

                {m.role === 'user' && !loading && (
                  <button
                    type="button"
                    onClick={() => { setEditingId(m.id); setInput(m.text); }}
                    className="mt-1 flex items-center gap-1 text-[11px] font-medium text-blue-100 hover:text-white hover:underline"
                  >
                    <Edit className="h-3 w-3" /> Edit
                  </button>
                )}

                {/* Embedded customer/supplier picker — renders directly
                    inside this message bubble, no modal, no screen
                    change. Disappears once a selection is made. */}
                {m.needsPicker && shop && (
                  <EmbeddedPartyPicker
                    kind={m.needsPicker.kind}
                    shopId={shop.id}
                    currency={shop.currency}
                    initialSearch={m.needsPicker.spokenName}
                    onSelect={(chosen) => handlePickerSelect(m.id, m.needsPicker!, chosen)}
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
  const map: Record<string, { en: string; roman: string; ur: string; hi: string }> = {
    daily_sales: {
      en: "Opening the daily sales report. Please check the Sales page for today's invoices.",
      roman: 'Aaj ki sales report ke liye Sales page check karein.',
      ur: 'آج کی سیلز رپورٹ کے لیے سیلز پیج دیکھیں۔',
      hi: 'आज की सेल्स रिपोर्ट के लिए सेल्स पेज देखें।',
    },
    monthly_sales: {
      en: "Opening the monthly sales report. Please check the Sales page for this month's invoices.",
      roman: 'Is mahine ki sales report ke liye Sales page check karein.',
      ur: 'اس مہینے کی سیلز رپورٹ کے لیے سیلز پیج دیکھیں۔',
      hi: 'इस महीने की सेल्स रिपोर्ट के लिए सेल्स पेज देखें।',
    },
    expenses: {
      en: 'Opening the expenses report. Please check the Expenses page.',
      roman: 'Kharchon ki report ke liye Expenses page check karein.',
      ur: 'اخراجات کی رپورٹ کے لیے ایکسپینسز پیج دیکھیں۔',
      hi: 'खर्चों की रिपोर्ट के लिए एक्सपेंसेस पेज देखें।',
    },
    profit: {
      en: 'Profit is calculated as sales minus purchases and expenses. Visit the Dashboard for a summary.',
      roman: 'Munafa = sales minus purchases minus kharche. Dashboard par summary dekh sakte hain.',
      ur: 'منافع = سیل مائنس خریداری مائنس اخراجات۔ ڈیش بورڈ پر خلاصہ دیکھیں۔',
      hi: 'मुनाफ़ा = बिक्री माइनस खरीद माइनस खर्च। डैशबोर्ड पर सारांश देखें।',
    },
    customer_balances: {
      en: 'Opening customer balances. Please check the Customers page.',
      roman: 'Customers ke balances ke liye Customers page check karein.',
      ur: 'گاہکوں کے بیلنس کے لیے کسٹمرز پیج دیکھیں۔',
      hi: 'ग्राहकों के बैलेंस के लिए कस्टमर्स पेज देखें।',
    },
    inventory: {
      en: 'Opening inventory. Please check the Products page for stock levels.',
      roman: 'Stock dekhne ke liye Products page check karein.',
      ur: 'اسٹاک دیکھنے کے لیے پروڈکٹس پیج دیکھیں۔',
      hi: 'स्टॉक देखने के लिए प्रोडक्ट्स पेज देखें।',
    },
  };
  const entry = map[type] ?? map.daily_sales;
  if (lang === 'hi') return `${entry.en}\n${entry.hi}`;
  if (lang === 'ur') return `${entry.roman}\n${entry.ur}`;
  if (lang === 'roman') return `${entry.roman}\n${entry.ur}`;
  return entry.en;
}
