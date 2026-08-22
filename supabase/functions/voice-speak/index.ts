import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Reuses the same AI_API_KEY as ai-assistant/voice-transcribe — one OpenAI
// key covers chat, speech-to-text, and text-to-speech. TTS_BASE_URL is kept
// separate from AI_BASE_URL (rather than reusing it) because a shop could
// point AI_BASE_URL at an OpenAI-compatible chat-only proxy that has no
// /audio/speech endpoint — TTS defaults straight to OpenAI's own API.
const AI_API_KEY = Deno.env.get("AI_API_KEY") ?? "";
const TTS_BASE_URL = (Deno.env.get("TTS_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
// tts-1-hd (not tts-1) — clearer pronunciation of numbers/digits in mixed
// Urdu+figure sentences ("previous balance 280"), which is what shopkeepers
// actually need to catch by ear. Costs a bit more latency, acceptable for
// short reply-length text.
const TTS_MODEL = Deno.env.get("TTS_MODEL") ?? "tts-1-hd";
const TTS_VOICE = Deno.env.get("TTS_VOICE") ?? "alloy";
// >1.0 = faster playback than default narration speed. 1.5 was tried
// first and reported too fast; 1.1 is a slight brisk-up instead.
const TTS_SPEED = Number(Deno.env.get("TTS_SPEED") ?? "1.1");
const TTS_TIMEOUT_MS = Number(Deno.env.get("TTS_TIMEOUT_MS") ?? "20000");

// A Latin-numeral amount ("280") sitting inside an otherwise-Urdu sentence
// tends to get read poorly by TTS models. The first fix tried here was
// swapping in Urdu-Indic numeral glyphs (۰-۹) instead of spelling the
// number out — verified LIVE via a TTS-then-Whisper-STT round trip
// (synthesize, transcribe the result back, check what number comes out).
// That round trip showed Urdu-Indic digits actually made it WORSE (lower
// transcription confidence, more garbled output) than plain digits, so
// that approach was reverted. Spelling the number out as Urdu words is
// what's actually shipped below — also verified via the same round-trip
// method before deploying, not assumed to work.
const URDU_ONES = [
  "صفر", "ایک", "دو", "تین", "چار", "پانچ", "چھ", "سات", "آٹھ", "نو", "دس",
  "گیارہ", "بارہ", "تیرہ", "چودہ", "پندرہ", "سولہ", "سترہ", "اٹھارہ", "انیس", "بیس",
  "اکیس", "بائیس", "تئیس", "چوبیس", "پچیس", "چھبیس", "ستائیس", "اٹھائیس", "انتیس", "تیس",
  "اکتیس", "بتیس", "تینتیس", "چونتیس", "پینتیس", "چھتیس", "سینتیس", "اڑتیس", "انتالیس", "چالیس",
  "اکتالیس", "بیالیس", "تینتالیس", "چوالیس", "پینتالیس", "چھیالیس", "سینتالیس", "اڑتالیس", "انچاس", "پچاس",
  "اکاون", "باون", "تریپن", "چون", "پچپن", "چھپن", "ستاون", "اٹھاون", "انسٹھ", "ساٹھ",
  "اکسٹھ", "باسٹھ", "تریسٹھ", "چونسٹھ", "پینسٹھ", "چھیاسٹھ", "سڑسٹھ", "اڑسٹھ", "انہتر", "ستر",
  "اکہتر", "بہتر", "تہتر", "چوہتر", "پچہتر", "چھہتر", "ستتر", "اٹھہتر", "اناسی", "اسی",
  "اکاسی", "بیاسی", "تراسی", "چوراسی", "پچاسی", "چھیاسی", "ستاسی", "اٹھاسی", "نواسی", "نوے",
  "اکیانوے", "بانوے", "ترانوے", "چورانوے", "پچانوے", "چھیانوے", "ستانوے", "اٹھانوے", "ننانوے",
];

function twoDigitWords(n: number): string {
  return n > 0 && n < 100 ? URDU_ONES[n] : "";
}

function integerToUrduWords(n: number): string {
  if (n === 0) return URDU_ONES[0];
  let rem = n;
  const parts: string[] = [];
  const crore = Math.floor(rem / 10000000); rem %= 10000000;
  const lakh = Math.floor(rem / 100000); rem %= 100000;
  const hazar = Math.floor(rem / 1000); rem %= 1000;
  const sau = Math.floor(rem / 100); rem %= 100;
  if (crore > 0) parts.push(`${twoDigitWords(crore)} کروڑ`);
  if (lakh > 0) parts.push(`${twoDigitWords(lakh)} لاکھ`);
  if (hazar > 0) parts.push(`${twoDigitWords(hazar)} ہزار`);
  if (sau > 0) parts.push(`${URDU_ONES[sau]} سو`);
  if (rem > 0) parts.push(twoDigitWords(rem));
  return parts.join(" ");
}

// Whole numbers only — a decimal amount (rare for whole-rupee shop
// transactions) is left as digits rather than risk a wrong "اعشاریہ"
// (point) construction with no way to verify it here.
function toUrduWords(text: string): string {
  return text.replace(/\d+(\.\d+)?/g, (match) => {
    if (match.includes(".")) return match;
    const n = parseInt(match, 10);
    if (!Number.isFinite(n) || n > 99999999) return match;
    return integerToUrduWords(n);
  });
}

async function synthesize(text: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!AI_API_KEY) {
    throw new Error("AI is not configured yet. The shop owner needs to add an AI_API_KEY secret in the Supabase project settings.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  try {
    const res = await fetch(`${TTS_BASE_URL}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      // The model auto-detects the input's language (Urdu, English, Hindi
      // all read naturally from the same voice) — no separate language
      // parameter needed, unlike speech-to-text.
      body: JSON.stringify({
        model: TTS_MODEL,
        voice: TTS_VOICE,
        input: text.slice(0, 4000),
        response_format: "mp3",
        speed: TTS_SPEED,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Text-to-speech provider returned ${res.status}: ${errText.slice(0, 200)}`);
    }
    const buf = await res.arrayBuffer();
    return { bytes: new Uint8Array(buf), contentType: "audio/mpeg" };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { text, lang } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "Missing 'text' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const spoken = lang === "ur" ? toUrduWords(text.trim()) : text.trim();
    const { bytes, contentType } = await synthesize(spoken);

    return new Response(bytes, {
      headers: { ...corsHeaders, "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: { code: "INTERNAL", message: err instanceof Error ? err.message : "Unknown error" } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
