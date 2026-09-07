import { AsyncHandler } from "../utils/AsyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import branchServices from "../services/branch.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// ==========================================
// 1. CREATE BRANCH
// ==========================================
const createBranch = AsyncHandler(async (req, res) => {
  const { branch, meta } = await branchServices.createBranchService(
    req.body,
    req.user.id
  );

  return res
    .status(201)
    .json(
      new ApiResponse(201, { branch, meta }, "Branch created successfully")
    );
});

// ==========================================
// 2. GET MY BRANCHES
// ==========================================
const getMyBranches = AsyncHandler(async (req, res) => {
  const result = await branchServices.getMyBranchesService(
    req.user.id,
    req.query
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { branches: result.branches, pagination: result.pagination },
        "My branches fetched successfully"
      )
    );
});

// ==========================================
// 2.1. BRANCH DIRECTORY SEARCH
// ==========================================
const searchBranches = AsyncHandler(async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const { branches } = await branchServices.searchBranchesService(query);

  return res
    .status(200)
    .json(new ApiResponse(200, { branches }, "Branches searched successfully"));
});

// ==========================================
// 2.3. GET MAIN BRANCHES
// ==========================================
const getMainBranches = AsyncHandler(async (req, res) => {
  const result = await branchServices.getMainBranchesService();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { branches: result.branches },
        "Main branches fetched successfully"
      )
    );
});

// ==========================================
// 3. GET BRANCH DETAILS
// ==========================================
const getBranchDetails = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const { branch, meta } = await branchServices.getBranchDetailsService(
    branchId,
    req.user.id
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { branch, meta },
        "Branch details fetched successfully"
      )
    );
});

// ==========================================
// 4. JOIN BRANCH (by join code)
// ==========================================
const joinBranch = AsyncHandler(async (req, res) => {
  const { joinCode } = req.body;

  if (!joinCode) {
    throw new ApiError(400, "Join code is required");
  }

  const { branch_id, branch_name } = await branchServices.joinBranchService(
    req.user.id,
    joinCode
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { branch_id, branch_name },
        "Joined branch successfully"
      )
    );
});

// ==========================================
// 6. DELETE BRANCH
// ==========================================
const deleteBranch = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;

  const { branch_id: id } = await branchServices.deleteBranchService(
    branchId,
    req.user.id
  );

  return res
    .status(200)
    .json(
      new ApiResponse(200, { branch_id: id }, "Branch deleted successfully")
    );
});

// ==========================================
// 7. UPDATE BRANCH
// ==========================================
const updateBranch = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;

  const { branch } = await branchServices.updateBranchService(
    branchId,
    req.user.id,
    req.body
  );

  return res
    .status(200)
    .json(new ApiResponse(200, { branch }, "Branch updated successfully"));
});

// ==========================================
// 8. GET BRANCH MEMBERS
// ==========================================
const getBranchMembers = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const result = await branchServices.getBranchMembersService(
    branchId,
    req.user.id,
    req.query
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        members: result.members,
        pagination: result.pagination,
        meta: result.meta,
      },
      "Branch members fetched successfully"
    )
  );
});


// ==========================================
// 10. REMOVE MEMBER
// ==========================================
const removeMember = AsyncHandler(async (req, res) => {
  const { branchId, memberId } = req.params;
  const { userId } = req.body || {};

  const {
    branch_id: id,
    user_id: removedUserId,
    member_id: removedMemberId,
  } = await branchServices.removeMemberService(
    branchId,
    req.user.id,
    userId || null,
    memberId || null
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { branch_id: id, user_id: removedUserId, member_id: removedMemberId },
        "Member removed successfully"
      )
    );
});

// ==========================================
// 13. ADD MANUAL MEMBER
// ==========================================
const addMember = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;

  const { member } = await branchServices.addMemberService(
    branchId,
    req.user.id,
    req.body
  );

  return res
    .status(201)
    .json(new ApiResponse(201, { member }, "Member added successfully"));
});

// ==========================================
// 14. UPDATE MEMBER DETAILS
// ==========================================
const updateMember = AsyncHandler(async (req, res) => {
  const { branchId, memberId } = req.params;

  const { member } = await branchServices.updateMemberService(
    branchId,
    req.user.id,
    memberId,
    req.body
  );

  return res
    .status(200)
    .json(new ApiResponse(200, { member }, "Member updated successfully"));
});

// ==========================================
// 15. SEARCH USERS (App Admin only)
// ==========================================
const searchUsers = AsyncHandler(async (req, res) => {
  const query =
    typeof req.query.query === "string"
      ? req.query.query
      : req.query.q || "";
  const { users } = await branchServices.searchUsersService(
    query,
    req.user.id
  );

  return res
    .status(200)
    .json(new ApiResponse(200, { users }, "Users searched successfully"));
});

// ==========================================
// 16. ADD BRANCH ADMIN (App Admin only)
// ==========================================
const addBranchAdmin = AsyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const { user_id } = req.body;

  const result = await branchServices.addBranchAdminService(
    branchId,
    req.user.id,
    user_id
  );

  return res
    .status(201)
    .json(new ApiResponse(201, result, "Branch admin added successfully"));
});

const branchControllers = {
  createBranch,
  getMyBranches,
  searchBranches,
  getMainBranches,
  getBranchDetails,
  joinBranch,
  removeMember,
  deleteBranch,
  updateBranch,
  getBranchMembers,
  addMember,
  updateMember,
  searchUsers,
  addBranchAdmin,
};

export default branchControllers;
