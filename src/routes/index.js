import authRouter from "./auth.routes.js";
import branchRouter from "./branch.routes.js";
import fileUploadRouter from "./common/fileUpload.routes.js";

import { FEATURE_FLAGS } from "../constants/featureFlags.js";

const registerRoutes = (app) => {
  // 1. Always Registered Routes
  app.use("/api/v1/auth", authRouter);

  // 2. Profile & Social Features (Controlled by FEATURE_FLAGS.PROFILE)
  if (FEATURE_FLAGS.PROFILE) {
    app.use("/api/v1/uploads", fileUploadRouter);
  }

  // 3. Other Modular Features (Controlled by their respective flags)
  FEATURE_FLAGS.BRANCH && app.use("/api/v1/branches", branchRouter);
};

export default registerRoutes;
