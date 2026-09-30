export function detectLang(text: string): string {
  if (/[ぁ-んァ-ヶ]/.test(text)) return "ja-JP";
  if (/[一-鿿]/.test(text)) return "zh-CN";
  if (/[가-힣]/.test(text)) return "ko-KR";
  if (/[а-яё]/i.test(text)) return "ru-RU";
  if (/[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i.test(text)) {
    return "vi-VN";
  }
  return "en-US";
}

export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function speak(text: string, lang = "", rate = 0.95) {
  if (!speechSupported() || !text.trim()) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang || detectLang(text);
    u.rate = rate;
    speechSynthesis.speak(u);
  } catch {
    /* speech is best-effort */
  }
}

export const SPEECH_LANGS = [
  { id: "", label: "Auto-detect" },
  { id: "en-US", label: "English (US)" },
  { id: "en-GB", label: "English (UK)" },
  { id: "vi-VN", label: "Vietnamese" },
  { id: "ja-JP", label: "Japanese" },
  { id: "ko-KR", label: "Korean" },
  { id: "zh-CN", label: "Chinese" },
  { id: "fr-FR", label: "French" },
  { id: "de-DE", label: "German" },
  { id: "es-ES", label: "Spanish" },
];
