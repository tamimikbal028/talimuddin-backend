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
    .default(null)
    .messages({
      "string.max": "Description cannot exceed 500 characters",
    }),

  location_name: Joi.string()
    .trim()
    .max(100)
    .optional()
    .allow("", null)
    .default(null)
    .messages({
      "string.max": "Location name cannot exceed 100 characters",
    }),

  location_url: Joi.string()
    .trim()
    .max(1000)
    .optional()
    .allow("", null)
    .default(null)
    .messages({
      "string.max": "Location URL cannot exceed 1000 characters",
    }),

  admin_info: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().trim().max(100).required().messages({
          "string.empty": "Admin name cannot be empty",
        }),
        number: Joi.string().trim().max(30).required().messages({
          "string.empty": "Admin number cannot be empty",
        }),
      })
    )
    .optional()
    .default([]),

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
    .default(null)
    .messages({
      "string.max": "Description cannot exceed 500 characters",
    }),

  location_name: Joi.string()
    .trim()
    .max(100)
    .optional()
    .allow("", null)
    .default(null)
    .messages({
      "string.max": "Location name cannot exceed 100 characters",
    }),

  location_url: Joi.string()
    .trim()
    .max(1000)
    .optional()
    .allow("", null)
    .default(null)
    .messages({
      "string.max": "Location URL cannot exceed 1000 characters",
    }),

  admin_info: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().trim().max(100).required().messages({
          "string.empty": "Admin name cannot be empty",
        }),
        number: Joi.string().trim().max(30).required().messages({
          "string.empty": "Admin number cannot be empty",
        }),
      })
    )
    .optional()
    .allow(null),

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

// Add manual member schema
const addMemberSchema = Joi.object({
  serial_no: Joi.number().integer().min(1).optional().allow(null, ""),
  name: Joi.string().trim().min(2).max(100).required().messages({
    "string.empty": "Member name is required",
    "any.required": "Member name is required",
  }),
  phone: Joi.string().trim().min(5).max(20).required().messages({
    "string.empty": "Phone number is required",
    "any.required": "Phone number is required",
  }),
  address: Joi.string().trim().max(250).optional().allow("", null),
  blood_group: Joi.string()
    .trim()
    .valid("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")
    .optional()
    .allow("", null),
  email: Joi.string().trim().email().optional().allow("", null),
  note: Joi.string().trim().max(500).optional().allow("", null),
});

// Update manual member schema
const updateMemberSchema = Joi.object({
  serial_no: Joi.number().integer().min(1).optional().allow(null, ""),
  name: Joi.string().trim().min(2).max(100).optional().messages({
    "string.empty": "Member name cannot be empty",
  }),
  phone: Joi.string().trim().min(5).max(20).optional().messages({
    "string.empty": "Phone number cannot be empty",
  }),
  address: Joi.string().trim().max(250).optional().allow("", null),
  blood_group: Joi.string()
    .trim()
    .valid("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")
    .optional()
    .allow("", null),
  email: Joi.string().trim().email().optional().allow("", null),
  note: Joi.string().trim().max(500).optional().allow("", null),
});

export {
  createBranchSchema,
  joinBranchSchema,
  updateBranchSchema,
  userIdBodySchema,
  addMemberSchema,
  updateMemberSchema,
};
