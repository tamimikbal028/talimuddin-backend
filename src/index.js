import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import app from "./app.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Clean up public/temp folder on server startup
const tempDir = path.join(__dirname, "../public/temp");
fs.mkdirSync(tempDir, { recursive: true });
if (fs.existsSync(tempDir)) {
  fs.readdirSync(tempDir).forEach((file) => {
    try {
      const filePath = path.join(tempDir, file);
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error("Failed to delete temp file on startup:", err);
    }
  });
}

const PORT = process.env.PORT || 8000;

// Catch errors before server starts
app.on("error", (error) => {
  console.log(`Server Error: ${error}`);
  throw error;
});

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
