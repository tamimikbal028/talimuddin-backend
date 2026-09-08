import { Router } from "express";
import { verifyJWT, optionalAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createBranchSchema,
  joinBranchSchema,
  updateBranchSchema,
  userIdBodySchema,
  addMemberSchema,
  updateMemberSchema,
  addBranchAdminSchema,
  addBranchModeratorSchema,
} from "../validators/branch.validator.js";

import branchControllers from "../controllers/branch.controller.js";
import branchFinanceRouter from "./branchFinance.routes.js";

const router = Router();

// ==========================================
// 1. PUBLIC ROUTES (with optional auth)
// ==========================================
// All branches listing (supports search/filtering, guest visible)
router.get("/", optionalAuth, branchControllers.getAllBranches);
router.get("/search", optionalAuth, branchControllers.searchBranches);
router.get("/main-branches", optionalAuth, branchControllers.getMainBranches);

// ==========================================
// 2. PROTECTED STATIC ROUTES (Must be before /:branchId wildcard)
// ==========================================
// Branch User Search (For appointing branch roles - App Admin only)
router.get("/users/search", verifyJWT, branchControllers.searchUsers);

// My Branches (User's joined branches)
router.get("/myBranches", verifyJWT, branchControllers.getMyBranches);

// ==========================================
// 3. PARAMETERIZED BRANCH ROUTES (/:branchId)
// ==========================================
// Branch details (About tab viewable by anyone, unauthenticated meta populated safely)
router.get("/:branchId", optionalAuth, branchControllers.getBranchDetails);

// Branch Finance Sub-Routes (Strictly guarded)
router.use("/:branchId/finance", verifyJWT, branchFinanceRouter);

// Branch Creation & Joining
router.post(
  "/",
  verifyJWT,
  validate(createBranchSchema),
  branchControllers.createBranch
);
router.post(
  "/join",
  verifyJWT,
  validate(joinBranchSchema),
  branchControllers.joinBranch
);

// Branch Admin Appointment
router.post(
  "/:branchId/admins",
  verifyJWT,
  validate(addBranchAdminSchema),
  branchControllers.addBranchAdmin
);

// Branch Moderator Appointment (Branch Admin / App Admin)
router.post(
  "/:branchId/moderators",
  verifyJWT,
  validate(addBranchModeratorSchema),
  branchControllers.addBranchModerator
);


// Branch Members (Strictly guarded - only members/admins)
router.get("/:branchId/members", verifyJWT, branchControllers.getBranchMembers);
router.post(
  "/:branchId/members",
  verifyJWT,
  validate(addMemberSchema),
  branchControllers.addMember
);
router.patch(
  "/:branchId/members/:memberId",
  verifyJWT,
  validate(updateMemberSchema),
  branchControllers.updateMember
);
router.delete(
  "/:branchId/members/:memberId",
  verifyJWT,
  branchControllers.removeMember
);

// Branch Edit & Delete (Branch Admin / App Admin)
router.patch(
  "/:branchId",
  verifyJWT,
  validate(updateBranchSchema),
  branchControllers.updateBranch
);
router.delete("/:branchId", verifyJWT, branchControllers.deleteBranch);

// Admin Member Action Routes (legacy userId in body)
router.delete(
  "/:branchId/remove",
  verifyJWT,
  validate(userIdBodySchema),
  branchControllers.removeMember
);

export default router;
