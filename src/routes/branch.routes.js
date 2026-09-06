import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createBranchSchema,
  joinBranchSchema,
  updateBranchSchema,
  userIdBodySchema,
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
router.patch(
  "/:branchId",
  validate(updateBranchSchema),
  branchControllers.updateBranch
);
router.delete("/:branchId", branchControllers.deleteBranch);
router.delete("/:branchId/leave", branchControllers.leaveBranch);

// Admin Member Action Routes (userId in body)
router.delete(
  "/:branchId/remove",
  validate(userIdBodySchema),
  branchControllers.removeMember
);
router.patch(
  "/:branchId/promote",
  validate(userIdBodySchema),
  branchControllers.promoteMember
);
router.patch(
  "/:branchId/demote",
  validate(userIdBodySchema),
  branchControllers.demoteMember
);

export default router;
