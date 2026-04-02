"use client";

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export type ChatMessageDTO = {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  fileName?: string | null;
  filePath?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  fileUrl?: string | null;
};

type TypingUser = {
  userId: string;
  userName: string;
  expiresAt: number;
};

type ReactionRow = {
  id: string;
  message_id: string;
  user_id: string;
  user_name: string;
  emoji: string;
  created_at: string;
};

type ReactionGroup = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

type PreviewImage = {
  url: string;
  name: string;
};

type ReplyTarget = {
  id: string;
  senderName: string;
  text: string;
  fileName?: string | null;
};

type ParsedReplyMessage = {
  isReply: boolean;
  replySender: string;
  replyPreview: string;
  bodyText: string;
};

type MentionUser = {
  userId: string;
  fullName: string;
};

type MentionState = {
  active: boolean;
  query: string;
  startIndex: number;
  endIndex: number;
};

const ALLOWED_EMOJIS = ["👍", "❤️", "😂", "😮"];

function formatTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(fileType?: string | null) {
  return Boolean(fileType && fileType.startsWith("image/"));
}

function getInitials(name: string) {
  if (!name) return "T";

  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0][0]?.toUpperCase() ?? "T";
  }

  return ((parts[0][0] ?? "") + (parts[1][0] ?? "")).toUpperCase();
}

function getAvatarColor(name: string) {
  const normalized = name.toLowerCase();

  if (normalized.includes("radu")) {
    return "#3F51B5";
  }

  if (normalized.includes("raluca")) {
    return "#7B1FA2";
  }

  if (normalized.includes("alexandra")) {
    return "#0A8F08";
  }

  if (normalized.includes("barbara")) {
    return "#F57C00";
  }

  return "#6366F1";
}

function isSameGroup(a: ChatMessageDTO | undefined, b: ChatMessageDTO | undefined) {
  if (!a || !b) return false;
  if (a.senderId !== b.senderId) return false;

  const diff = Math.abs(
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return diff <= 5 * 60 * 1000;
}

function groupReactions(
  reactions: ReactionRow[],
  currentUserId: string
): ReactionGroup[] {
  const grouped = new Map<string, ReactionGroup>();

  for (const reaction of reactions) {
    const existing = grouped.get(reaction.emoji);

    if (existing) {
      existing.count += 1;
      if (reaction.user_id === currentUserId) {
        existing.reactedByMe = true;
      }
    } else {
      grouped.set(reaction.emoji, {
        emoji: reaction.emoji,
        count: 1,
        reactedByMe: reaction.user_id === currentUserId,
      });
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) => ALLOWED_EMOJIS.indexOf(a.emoji) - ALLOWED_EMOJIS.indexOf(b.emoji)
  );
}

function autoResizeTextarea(
  textarea: HTMLTextAreaElement | null,
  maxHeight = 160
) {
  if (!textarea) return;
  textarea.style.height = "0px";
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
}

function getReplyPreview(message: ChatMessageDTO) {
  const text = message.text?.trim();
  if (text) {
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }

  if (message.fileName) {
    return `📎 ${message.fileName}`;
  }

  return "Nachricht";
}

function buildReplyMessage(replyTarget: ReplyTarget | null, text: string) {
  if (!replyTarget) return text;

  const preview = replyTarget.text?.trim()
    ? replyTarget.text.trim()
    : replyTarget.fileName
      ? `📎 ${replyTarget.fileName}`
      : "Nachricht";

  const shortPreview = preview.length > 80 ? `${preview.slice(0, 80)}…` : preview;
  const replyHeader = `↪ Antwort auf ${replyTarget.senderName}: ${shortPreview}`;

  return text ? `${replyHeader}\n${text}` : replyHeader;
}

function parseReplyMessage(text: string): ParsedReplyMessage {
  const normalized = String(text ?? "");
  const match = normalized.match(/^↪ Antwort auf (.+?): ([^\n]*)(?:\n([\s\S]*))?$/);

  if (!match) {
    return {
      isReply: false,
      replySender: "",
      replyPreview: "",
      bodyText: normalized,
    };
  }

  return {
    isReply: true,
    replySender: (match[1] ?? "").trim(),
    replyPreview: (match[2] ?? "").trim(),
    bodyText: (match[3] ?? "").trim(),
  };
}

function normalizeMentionValue(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getMentionInsertValue(fullName: string) {
  const firstName = fullName.trim().split(/\s+/)[0] ?? fullName.trim();
  return `@${firstName}:`;
}

function getMentionMatch(
  value: string,
  caretPosition?: number | null
): MentionState {
  const caret =
    typeof caretPosition === "number" && caretPosition >= 0
      ? caretPosition
      : value.length;

  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(^|\s)@([^\s@]*)$/);

  if (!match || match.index == null) {
    return {
      active: false,
      query: "",
      startIndex: -1,
      endIndex: -1,
    };
  }

  const fullMatch = match[0];
  const atIndex = beforeCaret.lastIndexOf("@", match.index + fullMatch.length);

  if (atIndex < 0) {
    return {
      active: false,
      query: "",
      startIndex: -1,
      endIndex: -1,
    };
  }

  return {
    active: true,
    query: match[2] ?? "",
    startIndex: atIndex,
    endIndex: caret,
  };
}

function renderTextWithMentions(text: string, mine: boolean) {
  const parts = String(text ?? "").split(/(@[A-Za-zÀ-ÿ0-9._-]+:?)/g);

  return parts.map((part, index) => {
    if (/^@[A-Za-zÀ-ÿ0-9._-]+:?$/.test(part)) {
      const rawName = part.replace(/^@/, "").replace(/:$/, "");
      const color = getAvatarColor(rawName);

      return (
        <span
          key={`${part}-${index}`}
          className="inline-flex rounded-md border px-1.5 py-0.5 font-semibold"
          style={{
            borderColor: color,
            backgroundColor: mine ? `${color}33` : `${color}22`,
            color: mine ? "#111111" : color,
          }}
        >
          {part}
        </span>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function upsertMentionUser(
  map: Map<string, MentionUser>,
  userId: unknown,
  fullName: unknown
) {
  const normalizedUserId = String(userId ?? "").trim();
  const normalizedFullName = String(fullName ?? "").trim();

  if (!normalizedUserId || !normalizedFullName) return;

  const existing = map.get(normalizedUserId);

  if (!existing) {
    map.set(normalizedUserId, {
      userId: normalizedUserId,
      fullName: normalizedFullName,
    });
    return;
  }

  if (
    existing.fullName.length <= 1 ||
    normalizeMentionValue(existing.fullName) === normalizeMentionValue(existing.userId)
  ) {
    map.set(normalizedUserId, {
      userId: normalizedUserId,
      fullName: normalizedFullName,
    });
  }
}

const ChatMessageItem = memo(function ChatMessageItem({
  message,
  prevMessage,
  currentUserId,
  currentUserName,
  reactions,
  editingMessageId,
  editingText,
  onEditingTextChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onDelete,
  onToggleReaction,
  onOpenPreviewImage,
  onSwipeReply,
  onJumpToReplySource,
  editTextareaRef,
  messageRef,
  isHighlighted,
}: {
  message: ChatMessageDTO;
  prevMessage?: ChatMessageDTO;
  currentUserId: string;
  currentUserName: string;
  reactions: ReactionRow[];
  editingMessageId: string | null;
  editingText: string;
  onEditingTextChange: (value: string) => void;
  onSaveEdit: (messageId: string) => void;
  onCancelEdit: () => void;
  onStartEdit: (message: ChatMessageDTO) => void;
  onDelete: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onOpenPreviewImage: (image: PreviewImage) => void;
  onSwipeReply: (message: ChatMessageDTO) => void;
  onJumpToReplySource: (parsedReply: ParsedReplyMessage) => void;
  editTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  messageRef: (node: HTMLDivElement | null) => void;
  isHighlighted: boolean;
}) {
  const mine = message.senderId === currentUserId;
  const name = message.senderName || (mine ? currentUserName : "Team");
  const showHeader = !isSameGroup(prevMessage, message);
  const reactionGroups = groupReactions(reactions, currentUserId);
  const isDeleted = Boolean(message.deletedAt);
  const isEditing = editingMessageId === message.id;
  const hasAttachment = Boolean(message.fileUrl && message.fileName);
  const parsedReply = parseReplyMessage(message.text ?? "");
  const messageHasVisibleText = Boolean(
    (parsedReply.isReply ? parsedReply.bodyText : message.text)?.trim()
  );

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [replyHintVisible, setReplyHintVisible] = useState(false);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const swipeLockRef = useRef<"x" | "y" | null>(null);
  const didTriggerReplyRef = useRef(false);

  const resetSwipe = useCallback(() => {
    setSwipeOffset(0);
    setReplyHintVisible(false);
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    swipeLockRef.current = null;
    didTriggerReplyRef.current = false;
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (isEditing || isDeleted) return;
      if (e.touches.length !== 1) return;

      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      swipeLockRef.current = null;
      didTriggerReplyRef.current = false;
    },
    [isDeleted, isEditing]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (isEditing || isDeleted) return;
      if (e.touches.length !== 1) return;
      if (touchStartXRef.current == null || touchStartYRef.current == null) return;

      const dx = e.touches[0].clientX - touchStartXRef.current;
      const dy = e.touches[0].clientY - touchStartYRef.current;

      if (!swipeLockRef.current) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        swipeLockRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }

      if (swipeLockRef.current !== "x") return;
      if (dx <= 0) {
        setSwipeOffset(0);
        setReplyHintVisible(false);
        return;
      }

      const nextOffset = Math.min(dx, 72);
      setSwipeOffset(nextOffset);
      setReplyHintVisible(nextOffset > 20);

      if (nextOffset > 54 && !didTriggerReplyRef.current) {
        didTriggerReplyRef.current = true;
        onSwipeReply(message);
      }
    },
    [isDeleted, isEditing, message, onSwipeReply]
  );

  const handleTouchEnd = useCallback(() => {
    resetSwipe();
  }, [resetSwipe]);

  return (
    <div
      ref={messageRef}
      className={
        "flex gap-3 rounded-2xl py-1 transition-all duration-500 " +
        (isHighlighted ? "bg-indigo-500/10 ring-1 ring-indigo-400/40" : "")
      }
    >
      {showHeader ? (
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: getAvatarColor(name) }}
          title={name}
        >
          {getInitials(name)}
        </div>
      ) : (
        <div className="w-9 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        {showHeader ? (
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-white">
              {mine ? "Du" : name}
            </span>
            <span className="text-xs text-white/40">
              {formatTime(message.createdAt)}
            </span>
            {message.editedAt && !message.deletedAt ? (
              <span className="text-[10px] italic text-white/30">
                (bearbeitet)
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="relative">
          {replyHintVisible ? (
            <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] text-white/80 backdrop-blur">
              ↪ Antworten
            </div>
          ) : null}

          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            style={{
              transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
              transition: swipeOffset === 0 ? "transform 160ms ease" : "none",
            }}
          >
            {isEditing ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                <textarea
                  ref={editTextareaRef}
                  value={editingText}
                  onChange={(e) => onEditingTextChange(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSaveEdit(message.id)}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black"
                  >
                    Speichern
                  </button>
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {isDeleted ? (
                  <div
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm italic leading-6 text-white/40"
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    Nachricht gelöscht
                  </div>
                ) : (
                  <>
                    {(parsedReply.isReply || messageHasVisibleText) ? (
                      <div
                        className={
                          "rounded-xl px-3 py-2 text-sm leading-6 " +
                          (mine
                            ? "bg-white text-black"
                            : "border border-white/10 bg-white/10 text-white")
                        }
                      >
                        {parsedReply.isReply ? (
                          <button
                            type="button"
                            onClick={() => onJumpToReplySource(parsedReply)}
                            className={
                              "mb-2 block w-full rounded-lg border-l-4 px-3 py-2 text-left transition " +
                              (mine
                                ? "border-black/20 bg-black/5 hover:bg-black/10"
                                : "border-indigo-300/60 bg-white/5 hover:bg-white/10")
                            }
                          >
                            <div
                              className={
                                "text-[11px] font-semibold " +
                                (mine ? "text-black/70" : "text-indigo-200")
                              }
                            >
                              {parsedReply.replySender}
                            </div>
                            <div
                              className={
                                "mt-0.5 text-xs leading-5 " +
                                (mine ? "text-black/60" : "text-white/60")
                              }
                              style={{ whiteSpace: "pre-wrap" }}
                            >
                              {renderTextWithMentions(
                                parsedReply.replyPreview || "Nachricht",
                                mine
                              )}
                            </div>
                          </button>
                        ) : null}

                        {messageHasVisibleText ? (
                          <div style={{ whiteSpace: "pre-wrap" }}>
                            {renderTextWithMentions(
                              parsedReply.isReply
                                ? parsedReply.bodyText
                                : message.text,
                              mine
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {hasAttachment ? (
                      isImage(message.fileType) ? (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenPreviewImage({
                              url: message.fileUrl || "",
                              name: message.fileName || "Bild",
                            })
                          }
                          className={
                            "block w-full overflow-hidden rounded-xl border text-left text-sm transition " +
                            (mine
                              ? "border-white/20 bg-white/90 text-black hover:bg-white"
                              : "border-white/10 bg-white/5 text-white hover:bg-white/10")
                          }
                        >
                          <img
                            src={message.fileUrl || ""}
                            alt={message.fileName || "Bild"}
                            className="max-h-72 w-full object-cover"
                          />

                          <div className="flex items-center justify-between gap-3 px-3 py-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {message.fileName}
                              </div>
                              <div
                                className={
                                  "mt-1 text-xs " +
                                  (mine ? "text-black/60" : "text-white/50")
                                }
                              >
                                {message.fileType || "Datei"}
                                {message.fileSize
                                  ? ` • ${formatFileSize(message.fileSize)}`
                                  : ""}
                              </div>
                            </div>

                            <div
                              className={
                                "shrink-0 rounded-lg px-2 py-1 text-xs font-semibold " +
                                (mine
                                  ? "bg-black/10 text-black"
                                  : "bg-white/10 text-white")
                              }
                            >
                              Vollbild
                            </div>
                          </div>
                        </button>
                      ) : (
                        <a
                          href={message.fileUrl || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className={
                            "block overflow-hidden rounded-xl border text-sm transition " +
                            (mine
                              ? "border-white/20 bg-white/90 text-black hover:bg-white"
                              : "border-white/10 bg-white/5 text-white hover:bg-white/10")
                          }
                        >
                          <div className="flex items-center justify-between gap-3 px-3 py-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {message.fileName}
                              </div>
                              <div
                                className={
                                  "mt-1 text-xs " +
                                  (mine ? "text-black/60" : "text-white/50")
                                }
                              >
                                {message.fileType || "Datei"}
                                {message.fileSize
                                  ? ` • ${formatFileSize(message.fileSize)}`
                                  : ""}
                              </div>
                            </div>

                            <div
                              className={
                                "shrink-0 rounded-lg px-2 py-1 text-xs font-semibold " +
                                (mine
                                  ? "bg-black/10 text-black"
                                  : "bg-white/10 text-white")
                              }
                            >
                              Öffnen
                            </div>
                          </div>
                        </a>
                      )
                    ) : null}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {!isDeleted && !isEditing ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSwipeReply(message)}
              className="inline-flex text-xs text-white/60 hover:text-white"
              title="Antworten"
            >
              ↩ Antworten
            </button>

            {mine ? (
              <>
                <button
                  type="button"
                  onClick={() => onStartEdit(message)}
                  className="text-xs text-white/50 hover:text-white"
                >
                  ✏️ Bearbeiten
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(message.id)}
                  className="text-xs text-red-300 hover:text-red-200"
                >
                  🗑 Löschen
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {!isDeleted ? (
          <div
            className="mt-2 -mx-1 overflow-x-auto px-1 pb-1"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="flex min-w-max items-center gap-2">
              {reactionGroups.map((reaction) => (
                <button
                  key={reaction.emoji}
                  type="button"
                  onClick={() => onToggleReaction(message.id, reaction.emoji)}
                  className={
                    "shrink-0 inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition sm:min-h-8 sm:px-2 sm:py-1 " +
                    (reaction.reactedByMe
                      ? "border-white/30 bg-white/20 text-white"
                      : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10")
                  }
                >
                  <span className="text-sm">{reaction.emoji}</span>
                  <span>{reaction.count}</span>
                </button>
              ))}

              {ALLOWED_EMOJIS.map((emoji) => (
                <button
                  key={`${message.id}-${emoji}`}
                  type="button"
                  onClick={() => onToggleReaction(message.id, emoji)}
                  className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base text-white/80 transition hover:bg-white/10 sm:h-8 sm:w-8 sm:text-sm"
                  title={`Mit ${emoji} reagieren`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default function ChatClient({
  tenantId,
  currentUserId,
  currentUserName,
  initialMessages,
  embedded = false,
}: {
  tenantId: string | null;
  currentUserId: string;
  currentUserName: string;
  initialMessages: ChatMessageDTO[];
  embedded?: boolean;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [messages, setMessages] = useState<ChatMessageDTO[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [reactionsByMessage, setReactionsByMessage] = useState<
    Record<string, ReactionRow[]>
  >({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionState, setMentionState] = useState<MentionState>({
    active: false,
    query: "",
    startIndex: -1,
    endIndex: -1,
  });
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  const endRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mentionDropdownRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storageKey = useMemo(() => {
    if (!tenantId || !currentUserId) return null;
    return `team-chat:last-read:${tenantId}:${currentUserId}`;
  }, [tenantId, currentUserId]);

  const filteredMentionUsers = useMemo(() => {
    if (!mentionState.active) return [];

    const q = normalizeMentionValue(mentionState.query);

    const filtered = mentionUsers.filter((user) => {
      const full = normalizeMentionValue(user.fullName);
      const first = normalizeMentionValue(user.fullName.split(/\s+/)[0] ?? "");

      if (!q) return true;

      return full.includes(q) || first.startsWith(q);
    });

    return filtered.slice(0, 6);
  }, [mentionState.active, mentionState.query, mentionUsers]);

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionState.query]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    endRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  const mergeMessages = useCallback((incoming: ChatMessageDTO[]) => {
    setMessages((prev) => {
      const map = new Map<string, ChatMessageDTO>();

      for (const msg of prev) {
        map.set(String(msg.id), msg);
      }

      for (const msg of incoming) {
        map.set(String(msg.id), msg);
      }

      return Array.from(map.values()).sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });
  }, []);

  const collectMessageIds = useCallback(
    (incomingMessages?: ChatMessageDTO[]) => {
      const source = incomingMessages ?? messages;
      const ids = source
        .map((message) => String(message.id ?? "").trim())
        .filter(Boolean);

      return Array.from(new Set(ids));
    },
    [messages]
  );

  const setReactionRow = useCallback((row: ReactionRow) => {
    setReactionsByMessage((prev) => {
      const current = prev[row.message_id] ?? [];
      const exists = current.some((r) => r.id === row.id);

      return {
        ...prev,
        [row.message_id]: exists ? current : [...current, row],
      };
    });
  }, []);

  const removeReactionRow = useCallback((rowId: string) => {
    setReactionsByMessage((prev) => {
      const next: Record<string, ReactionRow[]> = {};

      for (const [messageId, rows] of Object.entries(prev)) {
        const filtered = rows.filter((r) => r.id !== rowId);
        if (filtered.length) next[messageId] = filtered;
      }

      return next;
    });
  }, []);

  const refetchMessages = useCallback(async () => {
    try {
      const messagesRes = await fetch("/api/chat/messages", { cache: "no-store" });

      if (!messagesRes.ok) return;

      const json = await messagesRes.json();
      const rows = Array.isArray(json?.messages) ? json.messages : [];

      const normalized: ChatMessageDTO[] = rows.map((r: any) => ({
        id: String(r.id),
        text: String(r.text ?? ""),
        senderId: String(r.sender_id),
        senderName: String(r.sender_name ?? ""),
        createdAt: String(r.created_at),
        editedAt: r.edited_at ? String(r.edited_at) : null,
        deletedAt: r.deleted_at ? String(r.deleted_at) : null,
        fileName: r.file_name ? String(r.file_name) : null,
        filePath: r.file_path ? String(r.file_path) : null,
        fileType: r.file_type ? String(r.file_type) : null,
        fileSize:
          typeof r.file_size === "number"
            ? r.file_size
            : r.file_size
              ? Number(r.file_size)
              : null,
        fileUrl: r.file_url ? String(r.file_url) : null,
      }));

      mergeMessages(normalized);

      const messageIds = collectMessageIds(normalized);

      if (messageIds.length === 0) {
        setReactionsByMessage({});
        return;
      }

      const { data: reactionsData, error: reactionsError } = await supabase
        .from("team_message_reactions")
        .select("id, message_id, user_id, user_name, emoji, created_at")
        .in("message_id", messageIds)
        .order("created_at", { ascending: true });

      if (!reactionsError) {
        const grouped: Record<string, ReactionRow[]> = {};
        for (const row of reactionsData ?? []) {
          const messageId = String(row.message_id);
          if (!grouped[messageId]) grouped[messageId] = [];
          grouped[messageId].push({
            id: String(row.id),
            message_id: String(row.message_id),
            user_id: String(row.user_id),
            user_name: String(row.user_name ?? ""),
            emoji: String(row.emoji),
            created_at: String(row.created_at),
          });
        }
        setReactionsByMessage(grouped);
      } else {
        console.error("[chat] load reactions failed", reactionsError.message);
      }
    } catch (e) {
      console.error("[chat] refetch failed", e);
    }
  }, [collectMessageIds, mergeMessages, supabase]);

  const loadMentionUsers = useCallback(async () => {
    if (!tenantId) return;

    try {
      const [profilesRes, messagesRes, reactionsRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("user_id, full_name, tenant_id")
          .eq("tenant_id", tenantId),
        fetch("/api/chat/messages", { cache: "no-store" }),
        supabase
          .from("team_message_reactions")
          .select("user_id, user_name"),
      ]);

      const userMap = new Map<string, MentionUser>();

      upsertMentionUser(userMap, currentUserId, currentUserName || "Du");

      if (!profilesRes.error) {
        for (const row of profilesRes.data ?? []) {
          upsertMentionUser(userMap, row?.user_id, row?.full_name);
        }
      } else {
        console.error("[chat] load mention users from profiles failed", profilesRes.error.message);
      }

      if (messagesRes.ok) {
        const json = await messagesRes.json();
        const rows = Array.isArray(json?.messages) ? json.messages : [];

        for (const row of rows) {
          upsertMentionUser(userMap, row?.sender_id, row?.sender_name);
        }
      } else {
        console.error("[chat] load mention users from messages failed", messagesRes.status);
      }

      if (!reactionsRes.error) {
        for (const row of reactionsRes.data ?? []) {
          upsertMentionUser(userMap, row?.user_id, row?.user_name);
        }
      } else {
        console.error("[chat] load mention users from reactions failed", reactionsRes.error.message);
      }

      const users = Array.from(userMap.values()).sort((a, b) =>
        a.fullName.localeCompare(b.fullName, "de")
      );

      setMentionUsers(users);
    } catch (e) {
      console.error("[chat] load mention users failed", e);
    }
  }, [supabase, tenantId, currentUserId, currentUserName]);

  const sendTypingEvent = useCallback(
    async (isTyping: boolean) => {
      const channel = typingChannelRef.current;
      if (!channel || !tenantId) return;

      try {
        await channel.send({
          type: "broadcast",
          event: "typing",
          payload: {
            userId: currentUserId,
            userName: currentUserName || "Team",
            isTyping,
            timestamp: Date.now(),
          },
        });
      } catch (e) {
        console.error("[typing] send failed", e);
      }
    },
    [tenantId, currentUserId, currentUserName]
  );

  const markLatestAsRead = useCallback(() => {
    if (!storageKey || messages.length === 0) return;

    const latestId = messages[messages.length - 1]?.id ?? null;
    if (!latestId) return;

    setLastReadMessageId(latestId);

    try {
      localStorage.setItem(storageKey, latestId);
    } catch {}
  }, [messages, storageKey]);

  const findReplySourceMessage = useCallback(
    (parsedReply: ParsedReplyMessage) => {
      const replySender = parsedReply.replySender.trim().toLowerCase();
      const replyPreview = parsedReply.replyPreview.trim();

      if (!replySender || !replyPreview) return null;

      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const msgName =
          msg.senderId === currentUserId
            ? "dir"
            : (msg.senderName || "Team").trim().toLowerCase();

        if (msgName !== replySender) continue;

        const preview = getReplyPreview(msg);
        if (
          preview === replyPreview ||
          preview.startsWith(replyPreview) ||
          replyPreview.startsWith(preview)
        ) {
          return msg;
        }
      }

      return null;
    },
    [messages, currentUserId]
  );

  const jumpToMessage = useCallback((messageId: string) => {
    const node = messageRefs.current[messageId];
    if (!node) return;

    node.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    setHighlightedMessageId(messageId);

    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId(null);
    }, 1800);
  }, []);

  function insertMention(user: MentionUser) {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    const currentText = text;
    const currentMention = getMentionMatch(
      currentText,
      textarea.selectionStart ?? currentText.length
    );

    if (!currentMention.active || currentMention.startIndex < 0) return;

    const mention = getMentionInsertValue(user.fullName);
    const before = currentText.slice(0, currentMention.startIndex);
    const after = currentText.slice(currentMention.endIndex);
    const needsSpaceAfter = after.startsWith(" ") || after.length === 0 ? "" : " ";
    const nextText = `${before}${mention}${needsSpaceAfter}${after}`;

    setText(nextText);
    setMentionState({
      active: false,
      query: "",
      startIndex: -1,
      endIndex: -1,
    });

    requestAnimationFrame(() => {
      textarea.focus();
      const pos = before.length + mention.length + needsSpaceAfter.length;
      textarea.setSelectionRange(pos, pos);
      autoResizeTextarea(textarea, 160);
    });
  }

  function insertMentionAtCursor(user: MentionUser) {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    const mention = getMentionInsertValue(user.fullName);
    const selectionStart = textarea.selectionStart ?? text.length;
    const selectionEnd = textarea.selectionEnd ?? text.length;

    const before = text.slice(0, selectionStart);
    const after = text.slice(selectionEnd);

    const needsSpaceBefore =
      before.length > 0 && !/\s$/.test(before) ? " " : "";
    const needsSpaceAfter =
      after.length > 0 && !/^[\s,.:;!?]/.test(after) ? " " : " ";

    const nextText = `${before}${needsSpaceBefore}${mention}${needsSpaceAfter}${after}`;

    setText(nextText);
    setMentionState({
      active: false,
      query: "",
      startIndex: -1,
      endIndex: -1,
    });

    requestAnimationFrame(() => {
      textarea.focus();
      const pos =
        before.length +
        needsSpaceBefore.length +
        mention.length +
        needsSpaceAfter.length;

      textarea.setSelectionRange(pos, pos);
      autoResizeTextarea(textarea, 160);
      scrollToBottom("smooth");
    });
  }

  useEffect(() => {
    if (!storageKey) return;

    try {
      const saved = localStorage.getItem(storageKey);
      setLastReadMessageId(saved || null);
    } catch {
      setLastReadMessageId(null);
    }
  }, [storageKey]);

  useEffect(() => {
    scrollToBottom("auto");
  }, [scrollToBottom]);

  useEffect(() => {
    loadMentionUsers();
  }, [loadMentionUsers]);

  useEffect(() => {
    if (!autoScroll) return;
    scrollToBottom(messages.length > 1 ? "smooth" : "auto");
  }, [autoScroll, messages, typingUsers.length, scrollToBottom]);

  useEffect(() => {
    if (autoScroll && document.visibilityState === "visible") {
      markLatestAsRead();
    }
  }, [autoScroll, messages, markLatestAsRead]);

  useEffect(() => {
    autoResizeTextarea(composerTextareaRef.current, 160);
  }, [text]);

  useEffect(() => {
    autoResizeTextarea(editTextareaRef.current, 220);
  }, [editingText, editingMessageId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setAutoScroll(dist < 80);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onFocus = () => {
      refetchMessages();
      loadMentionUsers();
      if (autoScroll) {
        markLatestAsRead();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refetchMessages();
        loadMentionUsers();
        if (autoScroll) {
          markLatestAsRead();
        }
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refetchMessages, loadMentionUsers, autoScroll, markLatestAsRead]);

  useEffect(() => {
    if (!tenantId) return;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        refetchMessages();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [tenantId, refetchMessages]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => prev.filter((u) => u.expiresAt > now));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!mentionState.active) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (mentionDropdownRef.current?.contains(target)) return;
      if (composerTextareaRef.current?.contains(target)) return;

      setMentionState({
        active: false,
        query: "",
        startIndex: -1,
        endIndex: -1,
      });
    };

    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [mentionState.active]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const viewport = window.visualViewport;

    const updateInset = () => {
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
      );
      setKeyboardInset(inset);
    };

    updateInset();
    viewport.addEventListener("resize", updateInset);
    viewport.addEventListener("scroll", updateInset);

    return () => {
      viewport.removeEventListener("resize", updateInset);
      viewport.removeEventListener("scroll", updateInset);
    };
  }, []);

  useEffect(() => {
    if (!previewImage) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewImage(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [previewImage]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
  const onMentionUser = (event: Event) => {
    const customEvent = event as CustomEvent<{ userId: string; fullName: string }>;
    const detail = customEvent.detail;

    if (!detail?.userId || !detail?.fullName) return;

    insertMentionAtCursor({
      userId: detail.userId,
      fullName: detail.fullName,
    });
  };

  window.addEventListener("chat:mention-user", onMentionUser as EventListener);

  return () => {
    window.removeEventListener("chat:mention-user", onMentionUser as EventListener);
  };
}, [text, scrollToBottom]);

  useEffect(() => {
    if (!tenantId) return;

    let messageChannel: ReturnType<typeof supabase.channel> | null = null;
    let typingChannel: ReturnType<typeof supabase.channel> | null = null;
    let reactionsChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          supabase.realtime.setAuth(token);
        }

        if (cancelled) return;

        messageChannel = supabase
          .channel(`team-messages:${tenantId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "team_messages",
              filter: `tenant_id=eq.${tenantId}`,
            },
            async (payload) => {
              const row = (payload.new || payload.old) as any;
              if (!row) return;

              if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
                const normalizedRow: ChatMessageDTO = {
                  id: String(row.id ?? ""),
                  text: String(row.text ?? ""),
                  senderId: String(row.sender_id ?? ""),
                  senderName:
                    String(row.sender_name ?? "") ||
                    (String(row.sender_id ?? "") === currentUserId
                      ? currentUserName
                      : "Team"),
                  createdAt: String(row.created_at ?? new Date().toISOString()),
                  editedAt: row.edited_at ? String(row.edited_at) : null,
                  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
                  fileName: row.file_name ? String(row.file_name) : null,
                  filePath: row.file_path ? String(row.file_path) : null,
                  fileType: row.file_type ? String(row.file_type) : null,
                  fileSize:
                    typeof row.file_size === "number"
                      ? row.file_size
                      : row.file_size
                        ? Number(row.file_size)
                        : null,
                  fileUrl:
                    row.file_url && typeof row.file_url === "string"
                      ? row.file_url
                      : null,
                };

                mergeMessages([normalizedRow]);

                const shouldReloadMentionUsers =
                  payload.eventType === "INSERT" &&
                  normalizedRow.senderId &&
                  normalizedRow.senderName;

                if (shouldReloadMentionUsers) {
                  loadMentionUsers();
                }

                const needsRefetchForAttachment =
                  Boolean(row.file_path) &&
                  (!row.file_url || payload.eventType === "INSERT");

                if (needsRefetchForAttachment) {
                  refetchMessages();
                }
              }
            }
          )
          .subscribe((status) => {
            console.log("[realtime] messages status:", status);
          });

        typingChannel = supabase
          .channel(`typing:${tenantId}`, {
            config: {
              broadcast: { self: false },
            },
          })
          .on("broadcast", { event: "typing" }, ({ payload }) => {
            const userId = String(payload?.userId ?? "");
            const userName = String(payload?.userName ?? "Team");
            const isTyping = Boolean(payload?.isTyping);

            if (!userId || userId === currentUserId) return;

            if (isTyping) {
              setTypingUsers((prev) => {
                const next = prev.filter((u) => u.userId !== userId);
                next.push({
                  userId,
                  userName,
                  expiresAt: Date.now() + 3000,
                });
                return next;
              });
            } else {
              setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
            }
          })
          .subscribe((status) => {
            console.log("[realtime] typing status:", status);
          });

        reactionsChannel = supabase
          .channel(`team-message-reactions:${tenantId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "team_message_reactions",
            },
            (payload) => {
              const row = payload.new as any;
              const messageId = String(row.message_id ?? "");

              if (!messageId) return;
              if (!messageRefs.current[messageId] && !messages.some((m) => m.id === messageId)) {
                return;
              }

              setReactionRow({
                id: String(row.id),
                message_id: messageId,
                user_id: String(row.user_id),
                user_name: String(row.user_name ?? ""),
                emoji: String(row.emoji),
                created_at: String(row.created_at),
              });
            }
          )
          .on(
            "postgres_changes",
            {
              event: "DELETE",
              schema: "public",
              table: "team_message_reactions",
            },
            (payload) => {
              const row = payload.old as any;
              removeReactionRow(String(row.id));
            }
          )
          .subscribe((status) => {
            console.log("[realtime] reactions status:", status);
          });

        typingChannelRef.current = typingChannel;
      } catch (e) {
        console.error("[realtime] setup error", e);
      }
    })();

    return () => {
      cancelled = true;

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      sendTypingEvent(false);

      if (messageChannel) supabase.removeChannel(messageChannel);
      if (typingChannel) supabase.removeChannel(typingChannel);
      if (reactionsChannel) supabase.removeChannel(reactionsChannel);
      typingChannelRef.current = null;
    };
  }, [
    supabase,
    tenantId,
    currentUserId,
    currentUserName,
    mergeMessages,
    sendTypingEvent,
    setReactionRow,
    removeReactionRow,
    refetchMessages,
    loadMentionUsers,
    messages,
  ]);

  async function send() {
    const value = text.trim();
    const file = selectedFile;

    if ((!value && !file && !replyTarget) || sending) return;

    const finalText = buildReplyMessage(replyTarget, value);

    setSending(true);
    try {
      setText("");
      setSelectedFile(null);
      setReplyTarget(null);
      setMentionState({
        active: false,
        query: "",
        startIndex: -1,
        endIndex: -1,
      });

      if (fileInputRef.current) fileInputRef.current.value = "";
      await sendTypingEvent(false);

      let res: Response;

      if (file) {
        const formData = new FormData();
        formData.append("text", finalText);
        formData.append("file", file);

        res = await fetch("/api/chat/messages", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: finalText }),
        });
      }

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Senden fehlgeschlagen");
      }

      setAutoScroll(true);
      requestAnimationFrame(() => {
        scrollToBottom("smooth");
        markLatestAsRead();
      });
    } catch (e) {
      setText(value);
      setSelectedFile(file);
      console.error(e);
      alert("Nachricht/Datei konnte nicht gesendet werden.");
    } finally {
      setSending(false);
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    try {
      const res = await fetch("/api/chat/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Reaktion fehlgeschlagen");
      }
    } catch (e) {
      console.error(e);
      alert("Reaktion konnte nicht gespeichert werden.");
    }
  }

  async function saveEdit(messageId: string) {
    const value = editingText.trim();
    if (!value) return;

    try {
      const res = await fetch(`/api/chat/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Bearbeiten fehlgeschlagen");
      }

      setEditingMessageId(null);
      setEditingText("");
    } catch (e) {
      console.error(e);
      alert("Nachricht konnte nicht bearbeitet werden.");
    }
  }

  async function deleteMessage(messageId: string) {
    const ok = window.confirm("Willst du diese Nachricht wirklich löschen?");
    if (!ok) return;

    try {
      const res = await fetch(`/api/chat/messages/${messageId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Löschen fehlgeschlagen");
      }
    } catch (e) {
      console.error(e);
      alert("Nachricht konnte nicht gelöscht werden.");
    }
  }

  function handleTyping(value: string) {
    setText(value);

    const caret = composerTextareaRef.current?.selectionStart ?? value.length;
    const mention = getMentionMatch(value, caret);
    setMentionState(mention);

    if (!value.trim()) {
      sendTypingEvent(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      return;
    }

    sendTypingEvent(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      sendTypingEvent(false);
    }, 2500);
  }

  const handleStartEdit = useCallback(
    (message: ChatMessageDTO) => {
      setEditingMessageId(message.id);
      setEditingText(message.text);
      setTimeout(() => scrollToBottom("smooth"), 100);
    },
    [scrollToBottom]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingText("");
  }, []);

  const handleSwipeReply = useCallback(
    (message: ChatMessageDTO) => {
      setReplyTarget({
        id: message.id,
        senderName:
          message.senderId === currentUserId
            ? "dir"
            : message.senderName || "Team",
        text: getReplyPreview(message),
        fileName: message.fileName ?? null,
      });

      setTimeout(() => {
        composerTextareaRef.current?.focus();
        scrollToBottom("smooth");
      }, 50);
    },
    [currentUserId, scrollToBottom]
  );

  const handleJumpToReplySource = useCallback(
    (parsedReply: ParsedReplyMessage) => {
      const sourceMessage = findReplySourceMessage(parsedReply);

      if (!sourceMessage) {
        alert("Originalnachricht konnte nicht gefunden werden.");
        return;
      }

      jumpToMessage(sourceMessage.id);
    },
    [findReplySourceMessage, jumpToMessage]
  );

  const unreadDividerIndex = useMemo(() => {
    if (!lastReadMessageId || messages.length === 0) return -1;

    const lastReadIndex = messages.findIndex((m) => m.id === lastReadMessageId);
    if (lastReadIndex < 0) return -1;

    for (let i = lastReadIndex + 1; i < messages.length; i++) {
      if (messages[i].senderId !== currentUserId) {
        return i;
      }
    }

    return -1;
  }, [lastReadMessageId, messages, currentUserId]);

  const typingText =
    typingUsers.length === 0
      ? ""
      : typingUsers.length === 1
        ? `${typingUsers[0].userName} schreibt...`
        : `${typingUsers.map((u) => u.userName).join(", ")} schreiben...`;

  const showMentionDropdown =
    mentionState.active &&
    filteredMentionUsers.length > 0 &&
    editingMessageId === null;

  return (
    <>
      <div
        className={
          "flex min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.03] " +
          (embedded ? "h-full" : "h-[calc(100dvh-220px)]")
        }
      >
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-4 sm:py-4"
          style={{
            WebkitOverflowScrolling: "touch",
            paddingBottom: "7rem",
            contain: "layout paint size",
          }}
        >
          <div className="flex flex-col gap-1">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/60">
                Noch keine Nachrichten. Schreib die erste Nachricht an dein Team 👋
              </div>
            ) : null}

            {messages.map((m, index) => (
              <React.Fragment key={m.id}>
                {index === unreadDividerIndex ? (
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-indigo-400/30" />
                    <div className="shrink-0 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-200">
                      Neue Nachrichten
                    </div>
                    <div className="h-px flex-1 bg-indigo-400/30" />
                  </div>
                ) : null}

                <ChatMessageItem
                  message={m}
                  prevMessage={messages[index - 1]}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  reactions={reactionsByMessage[m.id] ?? []}
                  editingMessageId={editingMessageId}
                  editingText={editingText}
                  onEditingTextChange={setEditingText}
                  onSaveEdit={saveEdit}
                  onCancelEdit={handleCancelEdit}
                  onStartEdit={handleStartEdit}
                  onDelete={deleteMessage}
                  onToggleReaction={toggleReaction}
                  onOpenPreviewImage={setPreviewImage}
                  onSwipeReply={handleSwipeReply}
                  onJumpToReplySource={handleJumpToReplySource}
                  editTextareaRef={editTextareaRef}
                  messageRef={(node) => {
                    messageRefs.current[m.id] = node;
                  }}
                  isHighlighted={highlightedMessageId === m.id}
                />
              </React.Fragment>
            ))}

            {typingText ? (
              <div className="flex gap-3 py-2">
                <div className="w-9 shrink-0" />
                <div className="text-xs italic text-white/50">{typingText}</div>
              </div>
            ) : null}

            <div ref={endRef} />
          </div>
        </div>

        <div
          className="border-t border-white/10 bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/55"
          style={{
            paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)`,
          }}
        >
          <div className="p-3 sm:p-4">
            <div className="mx-auto max-w-3xl">
              {replyTarget ? (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                      Antwort
                    </div>
                    <div className="mt-1 text-sm font-medium text-white">
                      {replyTarget.senderName}
                    </div>
                    <div className="truncate text-xs text-white/60">
                      {replyTarget.text}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setReplyTarget(null)}
                    className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white"
                  >
                    Entfernen
                  </button>
                </div>
              ) : null}

              {selectedFile ? (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">
                      📎 {selectedFile.name}
                    </div>
                    <div className="text-xs text-white/50">
                      {selectedFile.type || "Datei"} •{" "}
                      {formatFileSize(selectedFile.size)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white"
                  >
                    Entfernen
                  </button>
                </div>
              ) : null}

              {showMentionDropdown ? (
                <div
                  ref={mentionDropdownRef}
                  className="mb-3 overflow-hidden rounded-xl border border-white/10 bg-[#0f0f10] shadow-2xl"
                >
                  <div className="border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-white/40">
                    Person erwähnen
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    {filteredMentionUsers.map((user, index) => {
                      const active = index === selectedMentionIndex;
                      const mentionValue = getMentionInsertValue(user.fullName);

                      return (
                        <button
                          key={user.userId}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(user);
                          }}
                          className={
                            "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition " +
                            (active
                              ? "bg-white text-black"
                              : "text-white hover:bg-white/5")
                          }
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{user.fullName}</div>
                            <div
                              className={
                                "truncate text-xs " +
                                (active ? "text-black/60" : "text-white/40")
                              }
                            >
                              {mentionValue}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setSelectedFile(file);
                    setTimeout(() => scrollToBottom("smooth"), 100);
                  }}
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg text-white transition hover:bg-white/10 active:scale-[0.98]"
                  title="Datei anhängen"
                >
                  📎
                </button>

                <textarea
                  ref={composerTextareaRef}
                  value={text}
                  onFocus={() => {
                    setTimeout(() => scrollToBottom("smooth"), 120);
                  }}
                  onChange={(e) => handleTyping(e.target.value)}
                  onSelect={(e) => {
                    const target = e.currentTarget;
                    const mention = getMentionMatch(
                      target.value,
                      target.selectionStart ?? target.value.length
                    );
                    setMentionState(mention);
                  }}
                  onKeyDown={(e) => {
                    if (showMentionDropdown) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setSelectedMentionIndex((prev) =>
                          prev >= filteredMentionUsers.length - 1 ? 0 : prev + 1
                        );
                        return;
                      }

                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setSelectedMentionIndex((prev) =>
                          prev <= 0 ? filteredMentionUsers.length - 1 : prev - 1
                        );
                        return;
                      }

                      if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                        const selectedUser = filteredMentionUsers[selectedMentionIndex];
                        if (selectedUser) {
                          insertMention(selectedUser);
                        }
                        return;
                      }

                      if (e.key === "Escape") {
                        e.preventDefault();
                        setMentionState({
                          active: false,
                          query: "",
                          startIndex: -1,
                          endIndex: -1,
                        });
                        return;
                      }
                    }

                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={
                    replyTarget
                      ? `Antwort an ${replyTarget.senderName}...`
                      : "Nachricht schreiben... Mit @ jemanden erwähnen"
                  }
                  rows={1}
                  className="min-h-[44px] max-h-40 flex-1 resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                />

                <button
                  type="button"
                  onClick={send}
                  disabled={sending || (!text.trim() && !selectedFile && !replyTarget)}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-black transition active:scale-[0.98] disabled:opacity-50"
                >
                  Senden
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {previewImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm text-white backdrop-blur"
          >
            Schließen
          </button>

          <div
            className="flex max-h-full w-full max-w-6xl flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-h-[80dvh] w-auto max-w-full rounded-xl object-contain"
            />
            <div className="mt-3 text-center text-sm text-white/80">
              {previewImage.name}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}