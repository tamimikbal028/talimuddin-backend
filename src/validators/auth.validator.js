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

  // Password policy: minimum 6 characters
  password: Joi.string().min(6).required().messages({
    "string.min": "Password must be at least 6 characters long",
    "string.empty": "Password is required",
  }),

  user_type: Joi.string().valid(USER_TYPES.USER).required().messages({
    "any.only": "Security Alert: You can only register as USER.",
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
  newPassword: Joi.string().min(6).required().messages({
    "string.min": "New password must be at least 6 characters long",
    "string.empty": "New password is required",
  }),
});

export { userRegisterSchema, userLoginSchema, changePasswordSchema };
