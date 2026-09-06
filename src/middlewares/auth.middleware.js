import { supabase } from "../config/supabase.js";
import { ApiError } from "../utils/ApiError.js";
import { AsyncHandler } from "../utils/AsyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import { ACCOUNT_STATUS, AUTH_USER_DB_SELECT } from "../constants/user.js";

const verifyJWT = AsyncHandler(async (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      throw new ApiError(401, "Unauthorized request. Token not found.");
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const userId = decodedToken.id;

    if (!userId) {
      throw new ApiError(401, "Invalid Access Token.");
    }

    const { data: userData, error: dbError } = await supabase
      .from("users")
      .select(AUTH_USER_DB_SELECT)
      .eq("id", userId)
      .single();

    if (dbError || !userData) {
      throw new ApiError(401, "Invalid Access Token. User does not exist.");
    }

    if (userData.account_status === ACCOUNT_STATUS.DELETED) {
      throw new ApiError(403, "This account has been deleted.");
    }

    if (userData.password_changed_at) {
      const changedTimestamp = parseInt(
        new Date(userData.password_changed_at).getTime() / 1000,
        10
      );
      if (changedTimestamp > decodedToken.iat) {
        const options = {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
        };

        return res
          .status(200)
          .clearCookie("accessToken", options)
          .clearCookie("refreshToken", options)
          .json(
            new ApiResponse(
              200,
              {},
              "Password changed. You have been logged out."
            )
          );
      }
    }

    req.user = userData;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(401, "Invalid or expired access token.");
  }
});

export { verifyJWT };
