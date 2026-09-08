import Joi from "joi";

const createNoticeSchema = Joi.object({
  title: Joi.string().trim().min(3).max(250).required().messages({
    "string.empty": "Notice title is required",
    "string.min": "Title must be at least 3 characters long",
    "string.max": "Title cannot exceed 250 characters",
    "any.required": "Notice title is required",
  }),
  content: Joi.string().trim().min(5).required().messages({
    "string.empty": "Notice content is required",
    "string.min": "Content must be at least 5 characters long",
    "any.required": "Notice content is required",
  }),
  is_pinned: Joi.boolean().default(false),
  is_active: Joi.boolean().default(true),
});

const updateNoticeSchema = Joi.object({
  title: Joi.string().trim().min(3).max(250).messages({
    "string.min": "Title must be at least 3 characters long",
    "string.max": "Title cannot exceed 250 characters",
  }),
  content: Joi.string().trim().min(5).messages({
    "string.min": "Content must be at least 5 characters long",
  }),
  is_pinned: Joi.boolean(),
  is_active: Joi.boolean(),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided to update notice",
  });

export { createNoticeSchema, updateNoticeSchema };
