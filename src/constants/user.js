// Account Status
export const ACCOUNT_STATUS = {
  ACTIVE: "ACTIVE",
  DELETED: "DELETED",
};

export const USER_TYPES = {
  ADMIN: "ADMIN",
  USER: "USER",
};

// --- Projections ---
/** Supabase public.users columns for auth/session (snake_case). */
export const AUTH_USER_DB_SELECT =
  "id, full_name, user_name, email, avatar, user_type, account_status, password_changed_at";

/** Supabase public.users columns for profile header display. */
export const USER_PROFILE_HEADER_SELECT =
  "id, full_name, user_name, email, avatar, user_type, account_status, created_at, updated_at";
