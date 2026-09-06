import fs from "fs";

export const abortCleanup = (req, res, next) => {
  res.on("close", () => {
    if (!res.writableEnded) {
      const filesToDelete = [];
      if (req.file) {
        filesToDelete.push(req.file.path);
      }
      if (req.files) {
        if (Array.isArray(req.files)) {
          req.files.forEach((file) => filesToDelete.push(file.path));
        } else {
          Object.values(req.files).forEach((fileArray) => {
            fileArray.forEach((file) => filesToDelete.push(file.path));
          });
        }
      }

      if (filesToDelete.length > 0) {
        filesToDelete.forEach((filePath) => {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(`[Abort Cleanup] Deleted orphaned file: ${filePath}`);
            }
          } catch (err) {
            console.error("Failed to delete temp file on abort:", err);
          }
        });
      }
    }
  });
  next();
};
