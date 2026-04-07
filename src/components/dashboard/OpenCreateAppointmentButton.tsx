"use client";

type Props = {
  accentColor?: string;
};

export default function OpenCreateAppointmentButton({ accentColor = "#d6c3a3" }: Props) {
  return (
    <button
      type="button"
      onClick={() => {
        document.dispatchEvent(new Event("open-create-appointment"));
      }}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[16px] border sm:h-10 sm:w-10"
      style={{
        color: accentColor,
        backgroundColor: `${accentColor}14`,
        borderColor: `${accentColor}30`,
      }}
      aria-label="Neuen Termin erstellen"
      title="Neuen Termin erstellen"
    >
      <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 8.5v7" />
        <path d="M8.5 12h7" />
      </svg>
    </button>
  );
}
