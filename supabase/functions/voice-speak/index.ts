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
const TTS_MODEL = Deno.env.get("TTS_MODEL") ?? "tts-1";
const TTS_VOICE = Deno.env.get("TTS_VOICE") ?? "alloy";
const TTS_TIMEOUT_MS = Number(Deno.env.get("TTS_TIMEOUT_MS") ?? "20000");

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
    const { text } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "Missing 'text' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { bytes, contentType } = await synthesize(text.trim());

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
