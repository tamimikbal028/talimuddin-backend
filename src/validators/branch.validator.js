import Joi from "joi";

// Create branch schema
const createBranchSchema = Joi.object({
  name: Joi.string().trim().min(3).max(50).required().messages({
    "string.empty": "Branch name is required",
    "string.min": "Branch name must be at least 3 characters",
    "string.max": "Branch name cannot exceed 50 characters",
  }),

  description: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow("", null)
    .messages({
      "string.max": "Description cannot exceed 500 characters",
    }),

  require_post_approval: Joi.boolean().optional(),

  branch_type: Joi.string()
    .valid("MAIN", "SUB")
    .default("MAIN")
    .optional()
    .messages({
      "any.only": "Branch type must be either MAIN or SUB",
    }),

  parent_branch_id: Joi.string()
    .guid({ version: ["uuidv4"] })
    .when("branch_type", {
      is: "SUB",
      then: Joi.required().messages({
        "any.required": "Parent branch is required for sub branch",
        "string.empty": "Parent branch is required for sub branch",
      }),
      otherwise: Joi.optional().allow(null, ""),
    }),
}).unknown(true);

// Join branch schema
const joinBranchSchema = Joi.object({
  joinCode: Joi.string().trim().required().messages({
    "string.empty": "Join code is required",
    "any.required": "Join code is required",
  }),
});

// Update branch schema
const updateBranchSchema = Joi.object({
  name: Joi.string().trim().min(3).max(50).optional().messages({
    "string.min": "Branch name must be at least 3 characters",
    "string.max": "Branch name cannot exceed 50 characters",
  }),

  description: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow("", null)
    .messages({
      "string.max": "Description cannot exceed 500 characters",
    }),

  require_post_approval: Joi.boolean().optional(),
  branch_type: Joi.string().valid("MAIN", "SUB").optional(),
  parent_branch_id: Joi.string().guid({ version: ["uuidv4"] }).optional().allow(null, ""),
}).unknown(true);

// User ID in request body (for member actions)
const userIdBodySchema = Joi.object({
  userId: Joi.string()
    .guid({ version: ["uuidv4"] })
    .required()
    .messages({
      "string.guid": "userId must be a valid UUID",
      "any.required": "userId is required",
    }),
});

export {
  createBranchSchema,
  joinBranchSchema,
  updateBranchSchema,
  userIdBodySchema,
};
