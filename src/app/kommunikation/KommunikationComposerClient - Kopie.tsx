"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
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

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={
        "absolute bottom-1.5 right-1.5 z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.045] text-white transition-colors active:scale-[0.98] " +
        (pending || disabled
          ? "pointer-events-none cursor-not-allowed opacity-45"
          : "hover:bg-[#d8c1a0]/[0.10]")
      }
      aria-label="Nachricht senden"
      title="Senden"
    >
      {pending ? (
        <span className="text-sm font-bold">…</span>
      ) : (
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
      )}
    </button>
  );
}

export default function KommunikationComposerClient({
  action,
  conversationId,
  statusFilter,
  draftBody = "",
  selectedTemplateTitle = null,
}: Props) {
  const [text, setText] = useState(draftBody);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setText(draftBody);
    requestAnimationFrame(() => autoResizeTextarea(textareaRef.current));
  }, [draftBody]);

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

  const canSend = Boolean(text.trim() || selectedFile);

  return (
    <form
      action={action}
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

          {selectedFile ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-[16px] border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.045] px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">
                  📎 {selectedFile.name}
                </div>
                <div className="text-xs text-white/50">
                  {selectedFile.type || "Datei"} • {formatFileSize(selectedFile.size)}
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
            <div className="mb-2 flex gap-2 rounded-[18px] border border-[#d8c1a0]/16 bg-[#211813]/96 p-2 shadow-[0_14px_34px_rgba(0,0,0,0.35)]">
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
            </div>
          ) : null}

          <div className="relative flex w-full items-end">
            <input
              ref={fileInputRef}
              type="file"
              name="attachment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedFile(file);
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

            <SubmitButton disabled={!canSend} />
          </div>
        </div>
      </div>
    </form>
  );
}
