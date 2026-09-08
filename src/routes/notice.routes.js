import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/verifyAdmin.middleware.js";
import { verifyNoticeReadAccess } from "../middlewares/verifyNoticeAccess.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createNoticeSchema,
  updateNoticeSchema,
} from "../validators/notice.validator.js";
import noticeControllers from "../controllers/notice.controller.js";

const router = Router();

// All notice routes require valid user session
router.use(verifyJWT);

// ==========================================
// 1. READ ROUTES (App Admin or Branch Admin)
// ==========================================
router.get("/", verifyNoticeReadAccess, noticeControllers.getNotices);
router.get("/:noticeId", verifyNoticeReadAccess, noticeControllers.getNoticeById);

// ==========================================
// 2. WRITE ROUTES (App Admin only)
// ==========================================
router.post(
  "/",
  verifyAdmin,
  validate(createNoticeSchema),
  noticeControllers.createNotice
);

router.patch(
  "/:noticeId",
  verifyAdmin,
  validate(updateNoticeSchema),
  noticeControllers.updateNotice
);

router.delete("/:noticeId", verifyAdmin, noticeControllers.deleteNotice);

export default router;
