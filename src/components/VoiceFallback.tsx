import { useState } from "react";

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export default function VoiceFallback({ onTextSubmit }: { onTextSubmit: (text: string) => void }) {
  const [text, setText] = useState("");

  const handleMicFallback = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const recognition = new SR();
      recognition.lang = "en-US";
      recognition.start();

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        setText(transcript);
        onTextSubmit(transcript);
      };

      recognition.onerror = () => {
        alert("Voice failed—type instead");
      };
    } else {
      alert("Browser does not support speech recognition");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleMicFallback}
        className="px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity"
      >
        Type instead
      </button>
      {text && <p className="text-text text-sm">You said: {text}</p>}
    </div>
  );
}
