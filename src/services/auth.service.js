import { supabase, supabaseAuth } from "../config/supabase.js";
import {
  USER_TYPES,
  ACCOUNT_STATUS,
  AUTH_USER_DB_SELECT,
} from "../constants/user.js";
import jwt from "jsonwebtoken";
import { GetAuthUserWithMeta } from "../utils/AuthUserWithMeta.js";
import { ApiError } from "../utils/ApiError.js";

const assertAccountAllowed = (profile, { forRegister = false } = {}) => {
  if (!profile) return;

  if (profile.account_status === ACCOUNT_STATUS.DELETED) {
    throw new ApiError(
      403,
      forRegister
        ? "This account was deleted. Please contact support to restore it or use different details."
        : "Your account no longer exists or has been deleted."
    );
  }
};

const fetchProfileByEmail = async (email) => {
  const { data, error } = await supabase
    .from("users")
    .select(AUTH_USER_DB_SELECT)
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "Failed to look up user by email.");
  }

  return data;
};

const fetchProfileById = async (userId) => {
  const { data, error } = await supabase
    .from("users")
    .select(AUTH_USER_DB_SELECT)
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "User does not exist");
  }

  return data;
};

const generateAccessToken = (profile) =>
  jwt.sign(
    {
      id: profile.id,
      email: profile.email,
      userName: profile.user_name,
      userType: profile.user_type,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
  );

const generateRefreshToken = (userId) =>
  jwt.sign({ id: userId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
  });

const persistRefreshToken = async (userId, refreshToken) => {
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { refresh_token: refreshToken },
  });

  if (error) {
    throw new ApiError(500, "Failed to persist refresh token.");
  }
};

const getStoredRefreshToken = async (userId) => {
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error || !data?.user) {
    return null;
  }

  return data.user.app_metadata?.refresh_token ?? null;
};

const generateAccessAndRefreshTokens = async (userId) => {
  const profile = await fetchProfileById(userId);
  const accessToken = generateAccessToken(profile);
  const refreshToken = generateRefreshToken(userId);

  await persistRefreshToken(userId, refreshToken);

  return { accessToken, refreshToken };
};

// ==========================================
// AUTH ACTIONS
// ==========================================

const registerUserService = async (userData) => {
  const {
    full_name,
    email,
    password,
    user_type,
    agree_to_terms,
  } = userData;

  const normalizedEmail = email.toLowerCase().trim();

  if (user_type === USER_TYPES.ADMIN) {
    throw new ApiError(403, "Restricted user type.");
  }

  const existingProfile = await fetchProfileByEmail(normalizedEmail);
  if (existingProfile) {
    assertAccountAllowed(existingProfile, { forRegister: true });
    throw new ApiError(409, "User with this email already exists");
  }

  const { data: authData, error: signUpError } =
    await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name,
        user_type: user_type,
        agree_to_terms: agree_to_terms,
      },
    });

  if (signUpError || !authData?.user) {
    if (signUpError?.message?.toLowerCase().includes("already")) {
      throw new ApiError(409, "User with this email already exists");
    }
    throw new ApiError(
      500,
      signUpError?.message || "Something went wrong while registering the user"
    );
  }

  const userId = authData.user.id;

  // public.users row + unique user_name: SQL handle_new_user trigger on auth.users
  const profile = await fetchProfileById(userId);
  const { user: userWithMeta, meta } = await GetAuthUserWithMeta(profile);
  const { accessToken, refreshToken } =
    await generateAccessAndRefreshTokens(userId);

  // Sign in to get supabase session
  const { data: signInData, error: signInError } =
    await supabaseAuth.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

  const supabaseSession = signInData?.session
    ? {
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      }
    : null;

  return {
    user: userWithMeta,
    meta,
    accessToken,
    refreshToken,
    supabaseSession,
  };
};

const loginUserService = async ({ email, password }) => {
  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  const { data: signInData, error: signInError } =
    await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

  if (signInError || !signInData?.user) {
    throw new ApiError(401, "Email or password is incorrect.");
  }

  const profile = await fetchProfileByEmail(signInData.user.email);
  assertAccountAllowed(profile);

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    signInData.user.id
  );

  const { user: userWithMeta, meta } = await GetAuthUserWithMeta(profile);

  const supabaseSession = signInData?.session
    ? {
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      }
    : null;

  return {
    user: userWithMeta,
    meta,
    accessToken,
    refreshToken,
    supabaseSession,
  };
};

const logoutUserService = async (userId) => {
  await persistRefreshToken(userId, null);
  return {};
};

const refreshAccessTokenService = async (incomingRefreshToken) => {
  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const userId = decodedToken?.id;

    if (!userId) {
      throw new ApiError(401, "Invalid refresh token");
    }

    const storedRefreshToken = await getStoredRefreshToken(userId);

    if (!storedRefreshToken || incomingRefreshToken !== storedRefreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const profile = await fetchProfileById(userId);
    assertAccountAllowed(profile);

    return generateAccessAndRefreshTokens(userId);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
};

const changePasswordService = async (userId, oldPassword, newPassword) => {
  const profile = await fetchProfileById(userId);

  const { error: verifyError } = await supabaseAuth.auth.signInWithPassword({
    email: profile.email,
    password: oldPassword,
  });

  if (verifyError) {
    throw new ApiError(400, "Invalid old password");
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    userId,
    { password: newPassword }
  );

  if (updateError) {
    throw new ApiError(500, updateError.message || "Failed to update password");
  }

  const { error: profileError } = await supabase
    .from("users")
    .update({ password_changed_at: new Date().toISOString() })
    .eq("id", userId);

  if (profileError) {
    throw new ApiError(500, "Failed to record password change time.");
  }

  await persistRefreshToken(userId, null);

  return {};
};

const authServices = {
  registerUserService,
  loginUserService,
  logoutUserService,
  refreshAccessTokenService,
  changePasswordService,
};

export default authServices;
