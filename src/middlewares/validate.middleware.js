import { ApiError } from "../utils/ApiError.js";

const validate = (schema) => {
  return (req, _, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);

      return next(new ApiError(422, "Validation Error", errorMessages));
    }

    next();
  };
};

const validateParams = (schema) => {
  return (req, _, next) => {
    const { error } = schema.validate(req.params, { abortEarly: false });

    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return next(new ApiError(422, "Validation Error", errorMessages));
    }

    next();
  };
};

const validateQuery = (schema) => {
  return (req, _, next) => {
    const { error } = schema.validate(req.query, { abortEarly: false });

    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return next(new ApiError(422, "Validation Error", errorMessages));
    }

    next();
  };
};

export { validate, validateParams, validateQuery };
