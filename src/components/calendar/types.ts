export type ViewMode = "day" | "week" | "month" | "year";

export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export type Item = {
  id: string;
  start_at: string;
  end_at: string;

  title: string;
  note: string;
  status: AppointmentStatus | null;

  tenantId: string;
  tenantName: string;

  customerProfileId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;

  reminderSentAt: string | null;

  googleCalendarId?: string | null;
  googleCalendarLabel?: string | null;
  googleCalendarShortLabel?: string | null;
  googleCalendarColor?: string | null;
  isExtraGoogleCalendar?: boolean;

  canOpenCustomerProfile: boolean;
  canCreateFollowUp: boolean;
  canDeleteAppointment: boolean;
};

export type Positioned = Item & {
  _dayISO: string;
  _top: number;
  _height: number;
  _col: number;
  _cols: number;

  _timeLine: string;
  _customer: string;
};

export type DayMeta = {
  count: number;
  firstLabel: string | null;
  firstTenantName: string | null;
};