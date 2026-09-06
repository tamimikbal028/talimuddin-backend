import Joi from "joi";
import { USER_TYPES } from "../constants/user.js";

// 1. Registration Schema
const userRegisterSchema = Joi.object({
  full_name: Joi.string().trim().min(3).max(30).required().messages({
    "string.empty": "Full name is required",
    "string.min": "Full name must be at least 3 characters",
    "string.max": "Full name must be at most 30 characters",
  }),

  email: Joi.string().email().trim().lowercase().required(),

  // Password policy (strong)
  password: Joi.string()
    .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])"))
    .min(8)
    .required()
    .messages({
      "string.pattern.base":
        "Password must contain at least one lowercase, one uppercase letter and one number",
      "string.min": "Password must be at least 8 characters long",
    }),

  user_type: Joi.string()
    .valid(USER_TYPES.USER)
    .required()
    .messages({
      "any.only":
        "Security Alert: You can only register as USER.",
    }),

  // Real World Safety: Check Terms Agreement on backend as well
  agree_to_terms: Joi.boolean().valid(true).required().messages({
    "any.only": "You must agree to the terms and conditions.",
    "any.required": "Agreement to terms is required.",
  }),
});

// Login schema
const userLoginSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required().messages({
    "string.email": "Invalid email format",
    "string.empty": "Email is required",
    "any.required": "Email is required",
  }),
  password: Joi.string().required().messages({
    "string.empty": "Password is required",
  }),
});

// Change password schema
const changePasswordSchema = Joi.object({
  oldPassword: Joi.string().required().messages({
    "string.empty": "Current password is required",
  }),
  newPassword: Joi.string()
    .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])"))
    .min(8)
    .required()
    .messages({
      "string.pattern.base":
        "New password must contain at least one lowercase, one uppercase letter and one number",
      "string.min": "New password must be at least 8 characters long",
      "string.empty": "New password is required",
    }),
});

export {
  userRegisterSchema,
  userLoginSchema,
  changePasswordSchema,
};
