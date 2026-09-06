import { Router } from "express";

// Controllers
import authControllers from "../controllers/auth.controller.js";

// Middlewares
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

// Validators
import {
  userRegisterSchema,
  userLoginSchema,
  changePasswordSchema,
} from "../validators/auth.validator.js";

const router = Router();

// ==================================================
// PUBLIC ROUTES (No Login Required)
// ==================================================

router.post(
  "/register",
  validate(userRegisterSchema),
  authControllers.registerUser
);

router.post("/login", validate(userLoginSchema), authControllers.loginUser);

router.post("/refresh-token", authControllers.refreshAccessToken);

// ==================================================
// SECURED ROUTES (Login Required)
// ==================================================

router.use(verifyJWT);

router.post("/logout", authControllers.logoutUser);

router.post(
  "/change-password",
  validate(changePasswordSchema),
  authControllers.changeCurrentPassword
);

router.get("/current-user", authControllers.getCurrentUser);

export default router;
