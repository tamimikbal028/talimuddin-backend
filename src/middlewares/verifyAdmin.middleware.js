import { ApiError } from "../utils/ApiError.js";
import { AsyncHandler } from "../utils/AsyncHandler.js";
import { USER_TYPES } from "../constants/user.js";

/**
 * Middleware to check if the authenticated user is an app ADMIN.
 * Must be used after verifyJWT or verifySupabaseToken.
 */
const verifyAdmin = AsyncHandler(async (req, _, next) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const isAdmin = req.user.user_type === USER_TYPES.ADMIN;

  if (!isAdmin) {
    throw new ApiError(
      403,
      "You do not have permission to perform this action"
    );
  }

  next();
});

export { verifyAdmin };
