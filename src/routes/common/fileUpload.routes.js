import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { uploadImage } from "../../middlewares/multer.middleware.js";
import fileUploadControllers from "../../controllers/common/fileUpload.controller.js";

const router = Router();

router.use(verifyJWT);

// PATCH /api/v1/uploads/single-image
router.patch(
  "/single-image",
  uploadImage.single("image"),
  fileUploadControllers.uploadSingleImage
);

export default router;
