import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createBranchSchema,
  joinBranchSchema,
  updateBranchSchema,
  userIdBodySchema,
  addMemberSchema,
  updateMemberSchema,
} from "../validators/branch.validator.js";
import branchControllers from "../controllers/branch.controller.js";
import branchFinanceRouter from "./branchFinance.routes.js";

const router = Router();
router.use(verifyJWT);

// Branch Finance Sub-Routes
router.use("/:branchId/finance", branchFinanceRouter);

// Branch CRUD Routes
router.post("/", validate(createBranchSchema), branchControllers.createBranch);
router.get("/myBranches", branchControllers.getMyBranches);
router.get("/search", branchControllers.searchBranches);
router.get("/main-branches", branchControllers.getMainBranches);
router.post("/join", validate(joinBranchSchema), branchControllers.joinBranch);

// Branch Details Routes
router.get("/:branchId", branchControllers.getBranchDetails);
router.get("/:branchId/members", branchControllers.getBranchMembers);
router.post(
  "/:branchId/members",
  validate(addMemberSchema),
  branchControllers.addMember
);
router.patch(
  "/:branchId/members/:memberId",
  validate(updateMemberSchema),
  branchControllers.updateMember
);
router.delete("/:branchId/members/:memberId", branchControllers.removeMember);

router.patch(
  "/:branchId",
  validate(updateBranchSchema),
  branchControllers.updateBranch
);
router.delete("/:branchId", branchControllers.deleteBranch);
router.delete("/:branchId/leave", branchControllers.leaveBranch);

// Admin Member Action Routes (legacy userId in body)
router.delete(
  "/:branchId/remove",
  validate(userIdBodySchema),
  branchControllers.removeMember
);

export default router;
