"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  src: string;
  title?: string | null;
  outbound?: boolean;
  avatarName?: string | null;
  avatarUrl?: string | null;
  durationSeconds?: number | null;
};

function initialsFromName(name: string | null | undefined) {
  return (
    String(name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function formatTime(seconds: number | null | undefined) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) < 0) return "–:–";
  const safe = Math.floor(Number(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function KommunikationVoiceMessagePlayer({
  src,
  title = "Sprachnachricht",
  outbound = false,
  avatarName,
  avatarUrl,
  durationSeconds = null,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(
    Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0
      ? Number(durationSeconds)
      : null,
  );
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const readDuration = () => {
      const audioDuration = Number(audio.duration);
      if (Number.isFinite(audioDuration) && audioDuration > 0) {
        setDuration(audioDuration);
      }
    };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };

    audio.addEventListener("loadedmetadata", readDuration);
    audio.addEventListener("durationchange", readDuration);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    readDuration();

    return () => {
      audio.removeEventListener("loadedmetadata", readDuration);
      audio.removeEventListener("durationchange", readDuration);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [src]);

  const progress = useMemo(() => {
    if (!duration || duration <= 0) return 0;
    return Math.min(100, Math.max(0, (currentTime / duration) * 100));
  }, [currentTime, duration]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  };

  const seek = (value: string) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const next = (Number(value) / 100) * duration;
    audio.currentTime = Number.isFinite(next) ? next : 0;
    setCurrentTime(audio.currentTime || 0);
  };

  const changeVolume = (value: string) => {
    const next = Math.min(1, Math.max(0, Number(value) / 100));
    setVolume(next);
    if (audioRef.current) audioRef.current.volume = next;
  };

  return (
    <div
      className={`group/voice flex w-[min(76vw,330px)] items-center gap-2 rounded-full border px-2.5 py-2 transition-all duration-200 sm:w-[330px] sm:hover:w-[410px] ${
        outbound
          ? "border-[#d6c3a3]/24 bg-[#d6c3a3]/13"
          : "border-white/[0.10] bg-white/[0.045]"
      }`}
      title={title || "Sprachnachricht"}
    >
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />

      {!outbound ? (
        <div
          className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#d6c3a3]/24 bg-[#d6c3a3]/12 text-xs font-bold text-[#f7efe2]"
          aria-label={avatarName || "Kunde"}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={avatarName || "Kunde"} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              {initialsFromName(avatarName)}
            </span>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-black/40 bg-emerald-500 text-[9px] text-white">
            🎙
          </span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={togglePlay}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-[#f7efe2] transition hover:bg-white/[0.18]"
        aria-label={isPlaying ? "Sprachnachricht pausieren" : "Sprachnachricht abspielen"}
      >
        {isPlaying ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 5h3.6v14H7V5Zm6.4 0H17v14h-3.6V5Z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5-11-6.5Z" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={progress}
            onChange={(event) => seek(event.target.value)}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#d6c3a3]"
            aria-label="Sprachnachricht Position"
          />
          <span className="w-[38px] shrink-0 text-right text-[11px] font-semibold tabular-nums text-white/56">
            {formatTime(duration ? Math.max(0, duration - currentTime) : duration)}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[10px] font-semibold text-white/34">
          {title || "Sprachnachricht"}
        </div>
      </div>

      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/58 transition group-hover/voice:bg-white/[0.08] group-hover/voice:text-white/76">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M16 9a4 4 0 0 1 0 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <div className="pointer-events-none absolute bottom-10 right-0 w-28 rounded-full border border-white/10 bg-[#16110e]/95 px-3 py-2 opacity-0 shadow-[0_14px_38px_rgba(0,0,0,0.45)] transition group-hover/voice:pointer-events-auto group-hover/voice:opacity-100">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(volume * 100)}
            onChange={(event) => changeVolume(event.target.value)}
            className="w-full accent-[#d6c3a3]"
            aria-label="Lautstärke"
          />
        </div>
      </div>
    </div>
  );
}
