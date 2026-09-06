import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import registerRoutes from "./routes/index.js";
import { abortCleanup } from "./middlewares/abortCleanup.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const IP_ADDRESS = "192.168.0.103";

app.use(
  cors({
    origin: [
      "https://talimuddin-frontend.vercel.app",
      "http://localhost:5173",
      `http://${IP_ADDRESS}:5173`,
    ],
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(path.join(__dirname, "../public")));
app.use(cookieParser());

// Middleware to clean up uploaded temp files on aborted/cancelled requests
app.use(abortCleanup);

// Register routes
registerRoutes(app);

// Global Error Handling Middleware
app.use(errorHandler);

export default app;
