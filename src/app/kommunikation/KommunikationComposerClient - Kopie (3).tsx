
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import KommunikationVoiceMessagePlayer from "./KommunikationVoiceMessagePlayer";

type Props = {
  action?: (formData: FormData) => void | Promise<void>;
  conversationId: string;
  statusFilter: string;
  draftBody?: string;
  selectedTemplateTitle?: string | null;
};

const EMOJIS = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😅",
  "😂",
  "😊",
  "😍",
  "😘",
  "🥰",
  "😉",
  "👍",
  "🙏",
  "👏",
  "💅",
  "✨",
  "❤️",
  "💛",
  "💚",
  "🌸",
  "🎉",
  "🔥",
  "🤗",
  "👌",
  "💬",
  "📅",
  "⏰",
  "✅",
  "📎",
  "🧾",
];

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function autoResizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  const maxHeight = 144;
  textarea.style.height = "44px";
  const nextHeight = Math.min(Math.max(textarea.scrollHeight, 44), maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}

function fileKindLabel(file: File) {
  if (file.type.startsWith("image/")) return "Bild";
  if (file.type.startsWith("video/")) return "Video";
  if (file.type.startsWith("audio/")) return "Sprachnachricht";
  if (file.type === "application/pdf") return "PDF";
  return file.type || "Datei";
}

function validateWhatsappAttachment(file: File) {
  const lowerName = file.name.toLowerCase();
  const type = file.type.toLowerCase().split(";")[0]?.trim() || file.type.toLowerCase();
  const isSupported =
    type === "image/jpeg" ||
    type === "image/png" ||
    type === "image/webp" ||
    type === "image/gif" ||
    type === "video/mp4" ||
    type === "application/pdf" ||
    type === "audio/ogg" ||
    type === "audio/webm" ||
    type === "audio/mpeg" ||
    type === "audio/mp3" ||
    type === "audio/mp4" ||
    type === "audio/aac" ||
    type === "audio/wav" ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".webp") ||
    lowerName.endsWith(".gif") ||
    lowerName.endsWith(".mp4") ||
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".ogg") ||
    lowerName.endsWith(".webm") ||
    lowerName.endsWith(".mp3") ||
    lowerName.endsWith(".m4a") ||
    lowerName.endsWith(".aac") ||
    lowerName.endsWith(".wav");

  if (!isSupported) {
    return "Bitte nur JPG, PNG, WEBP, GIF, MP4, PDF oder Audio senden.";
  }

  if (file.size > 15 * 1024 * 1024) {
    return "Die Datei ist zu groß. Bitte unter 15 MB bleiben.";
  }

  return null;
}

function getSupportedAudioMimeType() {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/ogg;codecs=opus",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

function audioExtensionFromMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mp4")) return "m4a";
  if (normalized.includes("mpeg")) return "mp3";
  return "webm";
}

function formatRecordingTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[16px] w-[16px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

export default function KommunikationComposerClient({
  conversationId,
  statusFilter,
  draftBody = "",
  selectedTemplateTitle = null,
}: Props) {
  const router = useRouter();
  const [text, setText] = useState(draftBody);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "review">("idle");
  const [recordedAudioFile, setRecordedAudioFile] = useState<File | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setText(draftBody);
    requestAnimationFrame(() => autoResizeTextarea(textareaRef.current));
  }, [draftBody]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    };
  }, [recordedAudioUrl]);

  function insertEmoji(emoji: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? text.length;
    const nextText = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    const nextCaret = start + emoji.length;

    setText(nextText);
    setEmojiOpen(false);
    setMenuOpen(false);

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
      autoResizeTextarea(textareaRef.current);
    });
  }

  function clearRecordedAudio() {
    if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    setRecordedAudioUrl(null);
    setRecordedAudioFile(null);
    setRecordingState("idle");
    setRecordingSeconds(0);
  }

  async function startVoiceRecording() {
    if (recordingState === "recording" || isPending) return;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErrorMessage("Sprachaufnahme wird von diesem Browser nicht unterstützt.");
      return;
    }

    try {
      setErrorMessage(null);
      setMenuOpen(false);
      setEmojiOpen(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      clearRecordedAudio();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];

      const mimeType = getSupportedAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;

        const recordedMimeType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: recordedMimeType });
        recordingChunksRef.current = [];

        if (!blob.size) {
          setErrorMessage("Die Aufnahme war leer. Bitte nochmal versuchen.");
          setRecordingState("idle");
          return;
        }

        const extension = audioExtensionFromMimeType(recordedMimeType);
        const file = new File([blob], `sprachnachricht-${Date.now()}.${extension}`, { type: recordedMimeType });
        const objectUrl = URL.createObjectURL(blob);
        setRecordedAudioFile(file);
        setRecordedAudioUrl(objectUrl);
        setRecordingState("review");
      };

      recorder.start(250);
      setRecordingSeconds(0);
      setRecordingState("recording");
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((value) => value + 1);
      }, 1000);
    } catch (error) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      setRecordingState("idle");
      setErrorMessage(error instanceof Error ? error.message : "Mikrofon konnte nicht gestartet werden.");
    }
  }

  function stopVoiceRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }

  function cancelVoiceRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    recordingChunksRef.current = [];
    clearRecordedAudio();
  }

  const canSend = Boolean(text.trim() || selectedFile || recordedAudioFile);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend || isPending) return;

    setErrorMessage(null);

    const formData = new FormData();
    formData.set("conversationId", conversationId);
    formData.set("conversation_id", conversationId);
    formData.set("statusFilter", statusFilter);
    formData.set("status_filter", statusFilter);
    formData.set("body", text.trim());
    const outgoingAttachment = selectedFile ?? recordedAudioFile;
    if (outgoingAttachment) formData.set("attachment", outgoingAttachment);
    if (!text.trim() && recordedAudioFile) formData.set("body", "🎙 Sprachnachricht");

    startTransition(async () => {
      try {
        const response = await fetch("/api/twilio/whatsapp/send", {
          method: "POST",
          body: formData,
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.ok) {
          const message =
            typeof result?.error === "string"
              ? result.error
              : "Nachricht konnte nicht gesendet werden.";
          setErrorMessage(message);
          return;
        }

        setText("");
        setSelectedFile(null);
        clearRecordedAudio();
        setMenuOpen(false);
        setEmojiOpen(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        requestAnimationFrame(() => autoResizeTextarea(textareaRef.current));
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Nachricht konnte nicht gesendet werden.",
        );
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 bg-transparent px-2 pb-2 pt-1 sm:px-4 sm:pb-4 sm:pt-2"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)",
      }}
    >
      <input type="hidden" name="conversation_id" value={conversationId} />
      <input type="hidden" name="status_filter" value={statusFilter} />

      <div className="w-full bg-transparent p-0">
        <div className="relative w-full">
          {selectedTemplateTitle ? (
            <div className="mb-3 flex items-start justify-between gap-3 rounded-[16px] border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.045] px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                  Vorlage eingefügt
                </div>
                <div className="mt-1 truncate text-sm font-medium text-white">
                  {selectedTemplateTitle}
                </div>
                <div className="truncate text-xs text-white/60">
                  Text kann vor dem Senden angepasst werden.
                </div>
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mb-3 rounded-[16px] border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm leading-5 text-red-100">
              {errorMessage}
            </div>
          ) : null}

          {recordingState === "recording" ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-[18px] border border-red-300/18 bg-red-500/10 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-50">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-300" />
                Aufnahme läuft · {formatRecordingTime(recordingSeconds)}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={cancelVoiceRecording} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/[0.08]">Abbrechen</button>
                <button type="button" onClick={stopVoiceRecording} className="rounded-full border border-[#d8c1a0]/20 bg-[#d8c1a0]/16 px-3 py-1.5 text-xs font-semibold text-[#f6f0e8] hover:bg-[#d8c1a0]/22">Stop</button>
              </div>
            </div>
          ) : null}

          {recordedAudioFile && recordedAudioUrl ? (
            <div className="mb-3 rounded-[20px] border border-[#d8c1a0]/12 bg-[#d8c1a0]/[0.04] px-3 py-3 pr-20 sm:pr-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">🎙 Sprachnachricht bereit</div>
                  <div className="text-xs text-white/48">{formatRecordingTime(recordingSeconds)} · wird als WhatsApp-Audio gesendet</div>
                </div>
                <button
                  type="button"
                  onClick={clearRecordedAudio}
                  className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/72 transition hover:bg-white/[0.08]"
                >
                  Entfernen
                </button>
              </div>
              <KommunikationVoiceMessagePlayer
                src={recordedAudioUrl}
                title="Sprachnachricht"
                outbound
                avatarName="Du"
                durationSeconds={recordingSeconds}
              />
            </div>
          ) : null}

          {selectedFile ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-[16px] border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.045] px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">
                  📎 {selectedFile.name}
                </div>
                <div className="text-xs text-white/50">
                  {fileKindLabel(selectedFile)} • {formatFileSize(selectedFile.size)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white hover:bg-white/[0.08]"
              >
                Entfernen
              </button>
            </div>
          ) : null}

          {emojiOpen ? (
            <div className="mb-2 overflow-hidden rounded-[18px] border border-[#d8c1a0]/16 bg-[#211813]/96 p-3 shadow-[0_14px_34px_rgba(0,0,0,0.35)]">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#d8c1a0]/60">
                  Emoji auswählen
                </div>
                <button
                  type="button"
                  onClick={() => setEmojiOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm text-white/80 hover:bg-white/[0.08]"
                  aria-label="Emoji schließen"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-10 gap-1.5 sm:grid-cols-12">
                {EMOJIS.map((emoji, index) => (
                  <button
                    key={`${emoji}-${index}`}
                    type="button"
                    onClick={() => insertEmoji(emoji)}
                    className="inline-flex aspect-square w-full items-center justify-center rounded-[12px] border border-transparent text-[21px] transition hover:border-white/10 hover:bg-white/[0.08] active:scale-95"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {menuOpen ? (
            <div className="mb-2 grid grid-cols-3 gap-2 rounded-[18px] border border-[#d8c1a0]/16 bg-[#211813]/96 p-2 shadow-[0_14px_34px_rgba(0,0,0,0.35)]">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setEmojiOpen(false);
                  fileInputRef.current?.click();
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.06] px-3 py-2 text-sm font-semibold text-[#f6f0e8] transition hover:bg-[#d8c1a0]/[0.10] active:scale-[0.98]"
              >
                <span aria-hidden="true">📎</span>
                Datei
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setEmojiOpen(true);
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.06] px-3 py-2 text-sm font-semibold text-[#f6f0e8] transition hover:bg-[#d8c1a0]/[0.10] active:scale-[0.98]"
              >
                <span aria-hidden="true">☺️</span>
                Emoji
              </button>
              <button
                type="button"
                onClick={startVoiceRecording}
                className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.06] px-3 py-2 text-sm font-semibold text-[#f6f0e8] transition hover:bg-[#d8c1a0]/[0.10] active:scale-[0.98]"
              >
                <MicIcon />
                Sprache
              </button>
            </div>
          ) : null}

          <div className="relative flex w-full items-end">
            <input
              ref={fileInputRef}
              type="file"
              name="attachment"
              className="hidden"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,application/pdf,audio/ogg,audio/webm,audio/mpeg,audio/mp4,audio/aac,audio/wav,.jpg,.jpeg,.png,.webp,.gif,.mp4,.pdf,.ogg,.webm,.mp3,.m4a,.aac,.wav"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;

                if (file) {
                  const validationError = validateWhatsappAttachment(file);
                  if (validationError) {
                    setSelectedFile(null);
                    setErrorMessage(validationError);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    return;
                  }
                }

                setErrorMessage(null);
                setSelectedFile(file);
                setMenuOpen(false);
                setEmojiOpen(false);
              }}
            />

            <button
              type="button"
              onClick={() => {
                setMenuOpen((open) => !open);
                setEmojiOpen(false);
              }}
              className={
                "absolute bottom-1.5 left-1.5 z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d8c1a0]/14 text-lg font-semibold leading-none text-white transition active:scale-[0.98] " +
                (menuOpen || emojiOpen
                  ? "bg-[#d8c1a0]/16"
                  : "bg-[#d8c1a0]/[0.045] hover:bg-[#d8c1a0]/[0.10]")
              }
              title="Aktion hinzufügen"
              aria-label="Aktion hinzufügen"
            >
              +
            </button>

            <textarea
              ref={textareaRef}
              name="body"
              rows={1}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                autoResizeTextarea(event.currentTarget);
              }}
              onInput={(event) => autoResizeTextarea(event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Gib eine Nachricht ein."
              className="h-11 min-h-[44px] max-h-36 w-full resize-none overflow-y-auto rounded-[22px] border border-[#d8c1a0]/16 bg-black/25 py-[12px] pl-12 pr-12 text-sm leading-[20px] text-white outline-none placeholder:text-white/38 transition focus:border-[#d8c1a0]/45 focus:bg-black/30 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            />

            <button
              type="submit"
              disabled={isPending || !canSend}
              className={
                "absolute bottom-1.5 right-1.5 z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.045] text-white transition-colors active:scale-[0.98] " +
                (isPending || !canSend
                  ? "pointer-events-none cursor-not-allowed opacity-45"
                  : "hover:bg-[#d8c1a0]/[0.10]")
              }
              aria-label="Nachricht senden"
              title="Senden"
            >
              {isPending ? <span className="text-sm font-bold">…</span> : <SendIcon />}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
