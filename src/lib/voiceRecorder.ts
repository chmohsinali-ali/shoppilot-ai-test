// Market-noise-aware voice capture for the AI Assistant's mic button.
//
// Browser SpeechRecognition (the previous implementation) gives no control
// over noise handling and doesn't work at all on iOS Safari. This records
// raw audio instead (sent to a server-side Whisper transcription — see
// callTranscribe in AssistantPage.tsx) and adds three real, dependency-free
// layers on top of it:
//
//  1. Browser-level noise suppression / echo cancellation / auto-gain via
//     getUserMedia constraints — genuine WebRTC audio-processing DSP, not a
//     placeholder.
//  2. Adaptive-threshold voice activity detection: the first ~400ms of
//     audio calibrates the shop's own ambient noise floor, and speech is
//     only counted once energy clearly exceeds it — so a generally noisy
//     market (vs. a quiet one) doesn't need a hand-tuned fixed threshold.
//  3. Hangover-based auto-stop: recording keeps going through brief pauses
//     (the shopkeeper handling goods with one hand) and only auto-stops
//     after a sustained silence, never "immediately".
export type VoiceRecorderOptions = {
  /** Called on ~every animation frame while recording, level in 0..1 for a live meter/waveform. */
  onLevel?: (level: number) => void;
  /** Fired once when auto-stop triggers (sustained silence or max duration) — caller should call stop(). */
  onAutoStop?: (reason: 'silence' | 'max-duration') => void;
  /** How long a sustained silence must last (after speech was heard) before auto-stopping. Default 2500ms. */
  silenceStopMs?: number;
  /** Hard safety cap on total recording length. Default 60000ms. */
  maxDurationMs?: number;
};

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: BlobPart[] = [];
  private rafId: number | null = null;
  private noiseFloor = 0;
  private calibrated = false;
  private speechDetected = false;
  private lastLoudTime = 0;
  private startTime = 0;
  private stopped = false;
  private mimeType = '';
  private readonly opts: VoiceRecorderOptions;

  constructor(opts: VoiceRecorderOptions = {}) {
    this.opts = opts;
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined'
      && !!navigator.mediaDevices?.getUserMedia
      && typeof MediaRecorder !== 'undefined';
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });

    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    this.mimeType = candidates.find((c) => MediaRecorder.isTypeSupported?.(c)) ?? '';
    this.mediaRecorder = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
    this.mediaRecorder.start();

    const AudioCtx: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioCtx();
    const source = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser);

    this.noiseFloor = 0;
    this.calibrated = false;
    this.speechDetected = false;
    this.stopped = false;
    this.startTime = performance.now();
    this.lastLoudTime = this.startTime;
    this.tick();
  }

  private tick = () => {
    if (!this.analyser || this.stopped) return;
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    const now = performance.now();
    const elapsed = now - this.startTime;

    if (!this.calibrated) {
      this.noiseFloor = Math.max(this.noiseFloor, rms);
      if (elapsed > 400) { this.calibrated = true; this.lastLoudTime = now; }
    } else {
      const threshold = Math.max(0.02, this.noiseFloor * 2.2);
      if (rms > threshold) { this.speechDetected = true; this.lastLoudTime = now; }
    }

    this.opts.onLevel?.(Math.min(1, rms * 4));

    const silenceStopMs = this.opts.silenceStopMs ?? 2500;
    const maxDurationMs = this.opts.maxDurationMs ?? 60000;
    if (this.calibrated && this.speechDetected && now - this.lastLoudTime > silenceStopMs) {
      this.opts.onAutoStop?.('silence');
      return;
    }
    if (elapsed > maxDurationMs) {
      this.opts.onAutoStop?.('max-duration');
      return;
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  /** Stops recording and resolves with the captured audio + its mime type. */
  async stop(): Promise<{ blob: Blob; mimeType: string }> {
    this.stopped = true;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    const mimeType = this.mimeType || 'audio/webm';
    return new Promise((resolve) => {
      if (!this.mediaRecorder) { resolve({ blob: new Blob(), mimeType }); return; }
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: mimeType });
        this.cleanup();
        resolve({ blob, mimeType });
      };
      if (this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
      else { resolve({ blob: new Blob(this.chunks, { type: mimeType }), mimeType }); this.cleanup(); }
    });
  }

  /** Aborts recording without needing the result (e.g. user cancelled). */
  cancel(): void {
    this.stopped = true;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch { /* already stopped */ }
    }
    this.cleanup();
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.audioCtx?.close().catch(() => { /* ignore */ });
    this.audioCtx = null;
    this.analyser = null;
    this.mediaRecorder = null;
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the "data:<mime>;base64," prefix — only the raw base64 body is sent.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
