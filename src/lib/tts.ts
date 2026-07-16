// Web Speech API wrapper (browser-only, gratis, sin créditos).
// Funciona en Chrome, Safari, Edge, Firefox, y en Android/iOS WebView (Capacitor/TWA).

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function getSpanishVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("es"));
}

export type SpeakOptions = {
  rate?: number;
  pitch?: number;
  voice?: SpeechSynthesisVoice | null;
  onEnd?: () => void;
  onStart?: () => void;
  onError?: (err: unknown) => void;
};

export function speak(text: string, opts: SpeakOptions = {}): SpeechSynthesisUtterance | null {
  if (!isSpeechSupported() || !text.trim()) return null;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = opts.voice?.lang ?? "es-ES";
  utterance.rate = opts.rate ?? 1;
  utterance.pitch = opts.pitch ?? 1;
  if (opts.voice) utterance.voice = opts.voice;
  if (opts.onEnd) utterance.onend = opts.onEnd;
  if (opts.onStart) utterance.onstart = opts.onStart;
  if (opts.onError) utterance.onerror = (e) => opts.onError?.(e);
  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function pause() {
  if (isSpeechSupported()) window.speechSynthesis.pause();
}

export function resume() {
  if (isSpeechSupported()) window.speechSynthesis.resume();
}

export function stop() {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
