import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import branchFinanceControllers from "../controllers/branchFinance.controller.js";

// mergeParams is required to access branchId from the parent route
const router = Router({ mergeParams: true });

router.use(verifyJWT);

router.route("/summary").get(branchFinanceControllers.getFinanceSummary);
router.route("/categories").get(branchFinanceControllers.getFinanceCategories);
router.route("/categories-list").get(branchFinanceControllers.getCategoriesList);
router.route("/categories").post(branchFinanceControllers.createCategory);
router.route("/export/month").get(branchFinanceControllers.getFinanceMonthExport);

router
  .route("/")
  .get(branchFinanceControllers.getFinanceEntries)
  .post(branchFinanceControllers.createFinanceEntry);

router
  .route("/:entryId")
  .put(branchFinanceControllers.updateFinanceEntry)
  .delete(branchFinanceControllers.deleteFinanceEntry);

router
  .route("/:entryId/payments")
  .get(branchFinanceControllers.getFinancePayments)
  .post(branchFinanceControllers.recordFinancePayment);

export default router;

