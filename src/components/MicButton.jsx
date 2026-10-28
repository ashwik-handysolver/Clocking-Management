import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { cx } from "./ui";

/*
 * Speech to text for text boxes. Click the mic, speak, click again to stop; what you said is
 * added to the end of the text. Uses the browser's built-in speech recognition (Chrome, Edge,
 * Safari). Where it isn't available the button explains that instead.
 */

const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

/** `value` + `onChange(newText)` — the same pair the text box uses. */
export default function MicButton({ value, onChange, className }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [problem, setProblem] = useState("");
  const rec = useRef(null);
  const latest = useRef(value);
  latest.current = value;

  // Stop listening if the form closes.
  useEffect(() => () => rec.current?.abort(), []);

  const start = () => {
    setProblem("");
    const r = new Recognition();
    r.lang = navigator.language || "en-IN";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finalText = "";
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else partial += t;
      }
      setInterim(partial);
      if (finalText.trim()) {
        const before = latest.current ?? "";
        const sep = before && !/\s$/.test(before) ? " " : "";
        // Capitalise the start of a new sentence.
        const text = finalText.trim();
        const sentence = !before.trim() || /[.!?]\s*$/.test(before) ? text[0].toUpperCase() + text.slice(1) : text;
        onChange(before + sep + sentence);
      }
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setProblem("Allow the microphone in your browser to use voice typing.");
      else if (e.error === "no-speech") setProblem("Didn't hear anything. Try again.");
      else if (e.error !== "aborted") setProblem("Voice typing stopped. Try again.");
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.current = r;
    r.start();
    setListening(true);
  };

  const stop = () => rec.current?.stop();

  if (!Recognition) {
    return (
      <span title="Voice typing works in Chrome, Edge and Safari" className={cx("grid size-8 place-items-center rounded-lg text-stone-300", className)}>
        <MicOff className="size-4" />
      </span>
    );
  }

  return (
    <span className={cx("flex items-center gap-2", className)}>
      {(listening || problem) && (
        <span className={cx("max-w-[14rem] truncate text-xs", problem ? "font-semibold text-red-600" : "text-stone-500 italic")} aria-live="polite">
          {problem || interim || "Listening…"}
        </span>
      )}
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-label={listening ? "Stop voice typing" : "Voice typing"}
        aria-pressed={listening}
        title={listening ? "Stop voice typing" : "Voice typing: speak instead of typing"}
        className={cx(
          "relative grid size-8 shrink-0 place-items-center rounded-lg transition",
          listening ? "bg-red-500 text-white shadow-[0_0_0_4px_rgb(239_68_68/0.2)]" : "bg-stone-100 text-stone-500 hover:bg-brand-50 hover:text-brand-600",
        )}
      >
        {listening && <span className="absolute inset-0 animate-ping rounded-lg bg-red-400/40" />}
        {listening ? <Square className="relative size-3" fill="currentColor" /> : <Mic className="size-4" />}
      </button>
    </span>
  );
}
