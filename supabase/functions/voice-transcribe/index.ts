import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Reuses the same AI_API_KEY/AI_BASE_URL secrets as the ai-assistant
// function — both are OpenAI-compatible endpoints under the one provider
// key already configured for this shop.
const AI_API_KEY = Deno.env.get("AI_API_KEY") ?? "";
const AI_BASE_URL = (Deno.env.get("AI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
const STT_MODEL = Deno.env.get("AI_STT_MODEL") ?? "whisper-1";
const STT_TIMEOUT_MS = Number(Deno.env.get("AI_STT_TIMEOUT_MS") ?? "30000");

type TranscribeResult = {
  text: string;
  // 0..1, derived from the provider's own per-segment log-probabilities —
  // a real signal of how sure the transcription is, not a placeholder.
  confidence: number;
  language?: string;
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function transcribe(audioBase64: string, mimeType: string, languageHint?: string, namePrompt?: string): Promise<TranscribeResult> {
  if (!AI_API_KEY) {
    throw new Error("AI is not configured yet. The shop owner needs to add an AI_API_KEY secret in the Supabase project settings.");
  }

  const bytes = base64ToBytes(audioBase64);
  if (bytes.length === 0) {
    return { text: "", confidence: 0 };
  }
  const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType || "audio/webm" }), `voice.${ext}`);
  form.append("model", STT_MODEL);
  form.append("response_format", "verbose_json");
  if (languageHint) form.append("language", languageHint);
  // Whisper's "prompt" biases both vocabulary and spelling toward text
  // that looks like this — used here to carry the shop's own real
  // customer/supplier names, so a proper noun (e.g. "Abbas") is more
  // likely to be transcribed correctly/completely instead of truncated,
  // which is the most common real-world cause of a transaction landing
  // on the wrong (or an accidentally new) account.
  if (namePrompt) form.append("prompt", namePrompt.slice(0, 800));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${AI_API_KEY}` },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Speech-to-text provider returned ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = typeof data.text === "string" ? data.text : "";
    const segments = Array.isArray(data.segments) ? data.segments : [];

    // A reasonable default when the provider returns no segment detail at
    // all (some OpenAI-compatible proxies omit it) — still requires the
    // shopkeeper's normal review of the editable transcript either way.
    let confidence = 0.75;
    if (segments.length > 0) {
      const typedSegments = segments as Array<{ avg_logprob?: number; no_speech_prob?: number }>;
      const avgLogProbs = typedSegments.map((s) => (typeof s.avg_logprob === "number" ? s.avg_logprob : -0.3));
      const meanLogProb = avgLogProbs.reduce((a: number, b: number) => a + b, 0) / avgLogProbs.length;
      // avg_logprob is a per-token log-probability (typically in -1..0);
      // exp() maps it back onto an approximate 0..1 confidence scale.
      confidence = Math.max(0, Math.min(1, Math.exp(meanLogProb)));
      const avgNoSpeech = typedSegments.reduce((a, s) => a + (typeof s.no_speech_prob === "number" ? s.no_speech_prob : 0), 0) / typedSegments.length;
      confidence = confidence * (1 - avgNoSpeech);
    }

    return { text: text.trim(), confidence, language: typeof data.language === "string" ? data.language : undefined };
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
    const { audio, mimeType, language, namePrompt } = await req.json();
    if (!audio || typeof audio !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'audio' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await transcribe(
      audio,
      typeof mimeType === "string" ? mimeType : "audio/webm",
      typeof language === "string" ? language : undefined,
      typeof namePrompt === "string" ? namePrompt : undefined,
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
