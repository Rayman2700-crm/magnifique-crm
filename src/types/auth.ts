export type AppRole = "ADMIN" | "PRACTITIONER";

export type CurrentUserProfile = {
  user_id: string;
  tenant_id: string | null;
  calendar_tenant_id: string | null;
  role: AppRole;
  full_name: string | null;
  is_active: boolean;
};

export type CurrentTenant = {
  id: string;
  slug: string;
  display_name: string;
  email: string | null;
};

export type CurrentUserContext = {
  authUser: {
    id: string;
    email: string | null;
  };
  profile: CurrentUserProfile;
  tenant: CurrentTenant | null;
};