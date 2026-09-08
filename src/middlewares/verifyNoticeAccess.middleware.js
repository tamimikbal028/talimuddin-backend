import { ApiError } from "../utils/ApiError.js";
import { AsyncHandler } from "../utils/AsyncHandler.js";
import { USER_TYPES } from "../constants/user.js";
import { supabase } from "../config/supabase.js";

/**
 * Middleware to check if the authenticated user is either an App Admin
 * OR a Branch Admin (is_admin = true in at least one branch).
 * Disallows moderators, members, or users without branch admin rights.
 */
const verifyNoticeReadAccess = AsyncHandler(async (req, _, next) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  // 1. App Admin check
  if (req.user.user_type === USER_TYPES.ADMIN) {
    req.isAppAdmin = true;
    return next();
  }

  // 2. Branch Admin check
  const { data: adminMemberships, error } = await supabase
    .from("branch_memberships")
    .select("id")
    .eq("user_id", req.user.id)
    .eq("is_admin", true)
    .eq("is_deleted", false)
    .limit(1);

  if (error) {
    throw new ApiError(500, "Failed to verify admin permissions");
  }

  const isBranchAdmin = Boolean(adminMemberships && adminMemberships.length > 0);

  if (!isBranchAdmin) {
    throw new ApiError(
      403,
      "Access denied. Only App Administrators and Branch Administrators can view notices."
    );
  }

  req.isBranchAdmin = true;
  next();
});

export { verifyNoticeReadAccess };
