import { AsyncHandler } from "../utils/AsyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import authServices from "../services/auth.service.js";
import { GetAuthUserWithMeta } from "../utils/AuthUserWithMeta.js";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
};
// -----------------------------
// Auth & Session
// -----------------------------
const registerUser = AsyncHandler(async (req, res) => {
  const clientOrigin =
    req.headers.origin || process.env.CLIENT_URL || "http://localhost:5173";
  const result = await authServices.registerUserService({
    ...req.body,
    redirectUrl: `${clientOrigin}/login`,
  });

  if (result.emailConfirmationRequired) {
    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          {
            emailConfirmationRequired: true,
            user: result.user,
          },
          result.message
        )
      );
  }

  const { user, meta, accessToken, refreshToken, supabaseSession } = result;

  return res
    .status(201)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        { user, meta, supabaseSession },
        "User registered Successfully"
      )
    );
});

const loginUser = AsyncHandler(async (req, res) => {
  const { user, meta, accessToken, refreshToken, supabaseSession } =
    await authServices.loginUserService(req.body);

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(200, { user, meta, supabaseSession }, `Welcome back ${user.full_name}!`)
    );
});

const logoutUser = AsyncHandler(async (req, res) => {
  await authServices.logoutUserService(req.user.id);

  return res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshAccessToken = AsyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;
  const { accessToken, refreshToken } =
    await authServices.refreshAccessTokenService(incomingRefreshToken);

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(new ApiResponse(200, {}, "Access token refreshed"));
});

const changeCurrentPassword = AsyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  await authServices.changePasswordService(
    req.user.id,
    oldPassword,
    newPassword
  );
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully."));
});

const getCurrentUser = AsyncHandler(async (req, res) => {
  const { user, meta } = await GetAuthUserWithMeta(req.user);

  return res
    .status(200)
    .json(new ApiResponse(200, { user, meta }, "User fetched successfully"));
});

const resendConfirmationEmail = AsyncHandler(async (req, res) => {
  const clientOrigin =
    req.headers.origin || process.env.CLIENT_URL || "http://localhost:5173";
  const result = await authServices.resendConfirmationEmailService({
    email: req.body.email,
    redirectUrl: `${clientOrigin}/login`,
  });

  return res.status(200).json(new ApiResponse(200, {}, result.message));
});

const authControllers = {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  resendConfirmationEmail,
};

export default authControllers;
