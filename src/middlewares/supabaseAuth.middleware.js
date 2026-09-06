import { supabase, supabaseAuth } from "../config/supabase.js";
import { ApiError } from "../utils/ApiError.js";
import { AsyncHandler } from "../utils/AsyncHandler.js";
import { ACCOUNT_STATUS, AUTH_USER_DB_SELECT } from "../constants/user.js";

/**
 * Middleware to verify Supabase Auth tokens.
 * This middleware extracts the token from the Authorization header,
 * verifies it with Supabase, and attaches the user object to req.user.
 */
const verifySupabaseToken = AsyncHandler(async (req, _, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "Authentication token is missing or invalid");
  }

  const token = authHeader.split(" ")[1];

  // 1. Verify token with Supabase Auth
  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);

  if (error || !user) {
    throw new ApiError(401, error?.message || "Invalid or expired session");
  }

  // 2. Fetch full user data from your custom users table
  const { data: userData, error: dbError } = await supabase
    .from("users")
    .select(AUTH_USER_DB_SELECT)
    .eq("id", user.id)
    .single();

  // Handle real database errors (PGRST116 means user not found, which is OK for new users)
  if (dbError && dbError.code !== "PGRST116") {
    throw new ApiError(500, "Database error while fetching user data.");
  }

  // Handle restricted status if profile exists
  if (userData) {
    if (userData.account_status === ACCOUNT_STATUS.DELETED) {
      throw new ApiError(403, "This account has been deleted.");
    }

    // Attach full user information to the request (matching auth.middleware.js format)
    req.user = {
      id: userData.id,
      full_name: userData.full_name,
      user_name: userData.user_name,
      email: userData.email,
      avatar: userData.avatar,
      user_type: userData.user_type,
      account_status: userData.account_status,
      password_changed_at: userData.password_changed_at,
    };
  } else {
    // User not found in database (new user case)
    req.user = {
      id: user.id,
      email: user.email,
    };
  }

  next();
});

export { verifySupabaseToken };

