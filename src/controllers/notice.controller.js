import { AsyncHandler } from "../utils/AsyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import noticeServices from "../services/notice.service.js";

// ==========================================
// 1. GET ALL NOTICES
// ==========================================
const getNotices = AsyncHandler(async (req, res) => {
  const isAppAdmin = req.user?.user_type === "ADMIN";
  const { notices, pagination } = await noticeServices.getNoticesService(
    req.query,
    isAppAdmin
  );

  const responsePayload = { notices, pagination };
  return res
    .status(200)
    .json(
      new ApiResponse(200, responsePayload, "Notices fetched successfully")
    );
});

// ==========================================
// 2. GET SINGLE NOTICE
// ==========================================
const getNoticeById = AsyncHandler(async (req, res) => {
  const { noticeId } = req.params;
  const { notice } = await noticeServices.getNoticeByIdService(noticeId);

  const responsePayload = { notice };
  return res
    .status(200)
    .json(
      new ApiResponse(200, responsePayload, "Notice retrieved successfully")
    );
});

// ==========================================
// 3. CREATE NOTICE (App Admin only)
// ==========================================
const createNotice = AsyncHandler(async (req, res) => {
  const { notice } = await noticeServices.createNoticeService(
    req.body,
    req.user.id
  );

  const responsePayload = { notice };
  return res
    .status(201)
    .json(
      new ApiResponse(201, responsePayload, "Notice created successfully")
    );
});

// ==========================================
// 4. UPDATE NOTICE (App Admin only)
// ==========================================
const updateNotice = AsyncHandler(async (req, res) => {
  const { noticeId } = req.params;
  const { notice } = await noticeServices.updateNoticeService(
    noticeId,
    req.body
  );

  const responsePayload = { notice };
  return res
    .status(200)
    .json(
      new ApiResponse(200, responsePayload, "Notice updated successfully")
    );
});

// ==========================================
// 5. DELETE NOTICE (App Admin only)
// ==========================================
const deleteNotice = AsyncHandler(async (req, res) => {
  const { noticeId } = req.params;
  const { result } = await noticeServices.deleteNoticeService(noticeId);

  const responsePayload = { result };
  return res
    .status(200)
    .json(
      new ApiResponse(200, responsePayload, "Notice deleted successfully")
    );
});

const noticeControllers = {
  getNotices,
  getNoticeById,
  createNotice,
  updateNotice,
  deleteNotice,
};

export default noticeControllers;
