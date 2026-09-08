import { AsyncHandler } from "../utils/AsyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import branchFinanceServices from "../services/branchFinance.service.js";

const getCategoriesList = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const userId = req.user.id;

  const { categories } = await branchFinanceServices.getCategoriesListService(
    branchId,
    userId
  );

  const response = res
    .status(200)
    .json(new ApiResponse(200, { categories }, "Categories list retrieved successfully"));

  return response;
});

const createCategory = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const userId = req.user.id;

  const { category } = await branchFinanceServices.createCategoryService(
    branchId,
    userId,
    req.body
  );

  const response = res
    .status(201)
    .json(new ApiResponse(201, { category }, "Category created successfully"));

  return response;
});

const createFinanceEntry = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const userId = req.user.id;

  const { entry } = await branchFinanceServices.createFinanceEntryService(
    branchId,
    userId,
    req.body
  );

  const response = res
    .status(201)
    .json(new ApiResponse(201, { entry }, "Finance entry created successfully"));

  return response;
});

const getFinanceEntries = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const userId = req.user.id;

  const { entries, pagination } = await branchFinanceServices.getFinanceEntriesService(
    branchId,
    userId,
    req.query
  );

  const response = res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { entries, pagination },
        "Finance entries retrieved successfully"
      )
    );

  return response;
});

const getFinanceSummary = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const userId = req.user.id;

  const { overall, monthlyStats } = await branchFinanceServices.getFinanceSummaryService(
    branchId,
    userId
  );

  const response = res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { overall, monthlyStats },
        "Finance summary retrieved successfully"
      )
    );

  return response;
});

const getFinanceCategories = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const userId = req.user.id;

  const { categories } = await branchFinanceServices.getFinanceCategoriesService(
    branchId,
    userId,
    req.query
  );

  const response = res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { categories },
        "Finance categories breakdown retrieved successfully"
      )
    );

  return response;
});

const getFinanceMonthExport = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const userId = req.user.id;

  const { year, month, entries, summary } =
    await branchFinanceServices.getFinanceMonthExportService(
      branchId,
      userId,
      req.query
    );

  const response = res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { year, month, entries, summary },
        "Monthly finance data exported successfully"
      )
    );

  return response;
});

const updateFinanceEntry = AsyncHandler(async (req, res) => {
  const { branchId, entryId } = req.params;
  const userId = req.user.id;
  const actionCode = req.body?.actionCode || req.headers["x-action-code"];

  const { entry } = await branchFinanceServices.updateFinanceEntryService(
    branchId,
    userId,
    entryId,
    req.body,
    actionCode
  );

  const response = res
    .status(200)
    .json(new ApiResponse(200, { entry }, "Finance entry updated successfully"));

  return response;
});

const deleteFinanceEntry = AsyncHandler(async (req, res) => {
  const { branchId, entryId } = req.params;
  const userId = req.user.id;
  const actionCode =
    req.body?.actionCode || req.headers["x-action-code"] || req.query?.actionCode;

  const { entryId: deletedId } =
    await branchFinanceServices.deleteFinanceEntryService(
      branchId,
      userId,
      entryId,
      actionCode
    );

  const response = res
    .status(200)
    .json(
      new ApiResponse(200, { entryId: deletedId }, "Finance entry deleted successfully")
    );

  return response;
});

const recordFinancePayment = AsyncHandler(async (req, res) => {
  const { branchId, entryId } = req.params;
  const userId = req.user.id;

  const { entry, payment } = await branchFinanceServices.recordFinancePaymentService(
    branchId,
    userId,
    entryId,
    req.body
  );

  const response = res
    .status(200)
    .json(new ApiResponse(200, { entry, payment }, "Payment recorded successfully"));

  return response;
});

const getFinancePayments = AsyncHandler(async (req, res) => {
  const { branchId, entryId } = req.params;
  const userId = req.user.id;

  const { payments } = await branchFinanceServices.getFinancePaymentsService(
    branchId,
    userId,
    entryId
  );

  const response = res
    .status(200)
    .json(new ApiResponse(200, { payments }, "Payment history retrieved successfully"));

  return response;
});

const getBranchActionCode = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const userId = req.user.id;

  const { actionCode } = await branchFinanceServices.getBranchActionCodeService(
    branchId,
    userId
  );

  const response = res
    .status(200)
    .json(
      new ApiResponse(200, { actionCode }, "Action code retrieved successfully")
    );

  return response;
});

const updateBranchActionCode = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const userId = req.user.id;
  const { actionCode } = req.body;

  const { actionCode: updatedCode } =
    await branchFinanceServices.updateBranchActionCodeService(
      branchId,
      userId,
      actionCode
    );

  const response = res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { actionCode: updatedCode },
        "Action code updated successfully"
      )
    );

  return response;
});

const branchFinanceControllers = {
  getCategoriesList,
  createCategory,
  createFinanceEntry,
  getFinanceEntries,
  getFinanceSummary,
  getFinanceCategories,
  getFinanceMonthExport,
  updateFinanceEntry,
  deleteFinanceEntry,
  recordFinancePayment,
  getFinancePayments,
  getBranchActionCode,
  updateBranchActionCode,
};

export default branchFinanceControllers;

