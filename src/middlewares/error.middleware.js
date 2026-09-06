import fs from "fs";
import { ApiError } from "../utils/ApiError.js";

const errorHandler = (err, req, res, next) => {
  let error = err;

  // Handle Multer errors explicitly
  if (err?.name === "MulterError") {
    let message = err.message;
    if (err.code === "LIMIT_FILE_SIZE") {
      message = "File is too large! Maximum limit is 100MB.";
    }
    error = new ApiError(400, message);
  }

  // 1. Convert any error to ApiError
  if (!(error instanceof ApiError)) {
    const statusCode = error?.statusCode || 500;
    const message = error?.message || "Something went wrong";
    error = new ApiError(statusCode, message, error?.errors || [], error?.stack);
  }

  // 2. AUTO CLEANUP LOGIC (Improved)
  const filesToDelete = [];

  // Case A: Single file (upload.single)
  if (req.file) {
    filesToDelete.push(req.file.path);
  }

  // Case B: Multiple files (upload.array or upload.fields)
  // In case of upload.fields, req.files is an Object { avatar: [..], cover: [..] }
  if (req.files) {
    if (Array.isArray(req.files)) {
      // upload.array case
      req.files.forEach((file) => filesToDelete.push(file.path));
    } else {
      // upload.fields case (Object loop)
      Object.values(req.files).forEach((fileArray) => {
        fileArray.forEach((file) => filesToDelete.push(file.path));
      });
    }
  }

  // 3. Delete files safely
  if (filesToDelete.length > 0) {
    filesToDelete.forEach((filePath) => {
      try {
        // Check if the file actually exists (maybe uploadFile function already deleted it)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Auto-Cleanup: Deleted -> ${filePath}`);
        }
      } catch (cleanupErr) {
        // If error occurs while deleting file, show in console but don't crash the server
        console.error("Error cleaning up file:", cleanupErr);
      }
    });
  }

  // 4. Send Response
  const response = {
    ...error,
    message: error.message,
    ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {}),
  };

  return res.status(error.statusCode).json(response);
};

export { errorHandler };
