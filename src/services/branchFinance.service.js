import { supabase } from "../config/supabase.js";
import { ApiError } from "../utils/ApiError.js";

// Helper to verify branch owner/admin permissions
const requireBranchAdmin = async (branchId, userId) => {
  // 1. Fetch Branch Creator
  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("creator_id, is_deleted")
    .eq("id", branchId)
    .maybeSingle();

  if (branchError || !branch || branch.is_deleted) {
    throw new ApiError(404, "Branch not found or has been deleted");
  }

  const isCreator = branch.creator_id === userId;

  // 2. Fetch Membership role
  const { data: membership, error: memError } = await supabase
    .from("branch_memberships")
    .select("is_admin")
    .eq("branch_id", branchId)
    .eq("user_id", userId)
    .maybeSingle();

  const isMember = !!membership;
  const isAdmin = membership?.is_admin === true;

  if (!isCreator && !(isMember && isAdmin)) {
    throw new ApiError(
      403,
      "Only branch creator or admins can perform this action"
    );
  }

  const result = { isCreator, isAdmin };
  return result;
};

// GET CATEGORIES LIST FOR SELECT BOX
const getCategoriesListService = async (branchId, userId) => {
  await requireBranchAdmin(branchId, userId);

  const { data: categories, error } = await supabase
    .from("branch_finance_categories")
    .select("id, name, type")
    .eq("branch_id", branchId)
    .order("name", { ascending: true });

  if (error) {
    throw new ApiError(500, "Failed to fetch categories list");
  }

  const result = { categories: categories || [] };
  return result;
};

// CREATE A NEW CATEGORY FOR THE BRANCH
const createCategoryService = async (branchId, userId, { name, type }) => {
  await requireBranchAdmin(branchId, userId);

  if (!name || !type) {
    throw new ApiError(400, "Category name and type are required");
  }

  if (type !== "INCOME" && type !== "EXPENSE") {
    throw new ApiError(400, "Type must be INCOME or EXPENSE");
  }

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new ApiError(400, "Category name cannot be empty");
  }

  // Check if category already exists for this branch
  const { data: existing, error: findError } = await supabase
    .from("branch_finance_categories")
    .select("id")
    .eq("branch_id", branchId)
    .eq("type", type)
    .ilike("name", trimmedName)
    .maybeSingle();

  if (findError) {
    throw new ApiError(500, "Error verifying category uniqueness");
  }

  if (existing) {
    throw new ApiError(
      400,
      `Category "${trimmedName}" already exists for ${type.toLowerCase()}s`
    );
  }

  const { data: newCategory, error: insertError } = await supabase
    .from("branch_finance_categories")
    .insert({
      branch_id: branchId,
      name: trimmedName,
      type,
    })
    .select()
    .single();

  if (insertError || !newCategory) {
    throw new ApiError(
      500,
      insertError?.message || "Failed to create category"
    );
  }

  const result = { category: newCategory };
  return result;
};

// CREATE FINANCE ENTRY
const createFinanceEntryService = async (branchId, userId, data) => {
  await requireBranchAdmin(branchId, userId);

  const {
    type,
    amount,
    category_id,
    note,
    date,
    personName,
    personPhone,
    details,
  } = data;

  if (!type || amount === undefined || !category_id) {
    throw new ApiError(400, "Type, amount, and category_id are required");
  }

  if (type !== "INCOME" && type !== "EXPENSE") {
    throw new ApiError(400, "Type must be INCOME or EXPENSE");
  }

  const parsedAmount = Number(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new ApiError(400, "Amount must be greater than 0");
  }

  // Verify category exists and matches type and branch
  const { data: category, error: catError } = await supabase
    .from("branch_finance_categories")
    .select("id, type")
    .eq("id", category_id)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (catError || !category) {
    throw new ApiError(400, "Invalid category selected for this branch");
  }

  if (category.type !== type) {
    throw new ApiError(400, "Category type mismatch");
  }

  // Validate breakdown details if provided
  if (details && Array.isArray(details) && details.length > 0) {
    const detailsSum = details.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0
    );
    if (Math.abs(detailsSum - parsedAmount) > 0.01) {
      throw new ApiError(
        400,
        `Total amount (${parsedAmount}) does not match the sum of item details (${detailsSum}).`
      );
    }
  }

  const { data: entry, error: insertError } = await supabase
    .from("branch_finances")
    .insert({
      branch_id: branchId,
      type,
      amount: parsedAmount,
      category_id,
      note: note?.trim() || "",
      date: date ? new Date(date).toISOString() : new Date().toISOString(),
      recorded_by: userId,
      person_name: personName?.trim() || "",
      person_phone: personPhone?.trim() || "",
      details: details?.length > 0 ? details : [],
    })
    .select(
      `
      id, branch_id, type, amount, note, date, person_name, person_phone, details, created_at,
      recorded_by:users!recorded_by(id, full_name, user_name, avatar),
      category:branch_finance_categories!category_id(id, name, type)
    `
    )
    .single();

  if (insertError || !entry) {
    throw new ApiError(
      500,
      insertError?.message || "Failed to create finance entry"
    );
  }

  const result = { entry };
  return result;
};

// GET FINANCE ENTRIES (Paginated & Filtered)
const getFinanceEntriesService = async (branchId, userId, query) => {
  await requireBranchAdmin(branchId, userId);

  const { type, category_id, page = 1, limit = 20, startDate, endDate } = query;

  let queryBuilder = supabase
    .from("branch_finances")
    .select(
      `
      id, branch_id, type, amount, note, date, person_name, person_phone, details, created_at,
      recorded_by:users!recorded_by(id, full_name, user_name, avatar),
      category:branch_finance_categories!category_id(id, name, type)
    `,
      { count: "exact" }
    )
    .eq("branch_id", branchId);

  if (type === "INCOME" || type === "EXPENSE") {
    queryBuilder = queryBuilder.eq("type", type);
  }

  if (category_id) {
    queryBuilder = queryBuilder.eq("category_id", category_id);
  }

  if (startDate) {
    queryBuilder = queryBuilder.gte("date", new Date(startDate).toISOString());
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    queryBuilder = queryBuilder.lte("date", end.toISOString());
  }

  const parsedPage = Number(page);
  const parsedLimit = Number(limit);
  const from = (parsedPage - 1) * parsedLimit;
  const to = from + parsedLimit - 1;

  const {
    data: entries,
    error,
    count,
  } = await queryBuilder
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new ApiError(500, error.message || "Failed to fetch finance entries");
  }

  const totalDocs = count ?? 0;
  const totalPages = Math.ceil(totalDocs / parsedLimit);

  const result = {
    entries: entries || [],
    pagination: {
      totalDocs,
      limit: parsedLimit,
      page: parsedPage,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPrevPage: parsedPage > 1,
    },
  };

  return result;
};

// GET FINANCE SUMMARY (Dashboard Overview)
const getFinanceSummaryService = async (branchId, userId) => {
  await requireBranchAdmin(branchId, userId);

  // 1. Fetch overall summary (Total Income, Total Expense)
  const { data: overallData, error: overallError } = await supabase
    .from("branch_finances")
    .select("type, amount")
    .eq("branch_id", branchId);

  if (overallError) {
    throw new ApiError(500, "Failed to compute overall summary");
  }

  let totalIncome = 0;
  let totalExpense = 0;
  if (overallData) {
    for (const item of overallData) {
      const amt = Number(item.amount);
      if (item.type === "INCOME") {
        totalIncome += amt;
      } else {
        totalExpense += amt;
      }
    }
  }

  // 2. Fetch monthly stats
  const { data: allTransactions, error: listError } = await supabase
    .from("branch_finances")
    .select(
      "type, amount, date, category:branch_finance_categories!category_id(name)"
    )
    .eq("branch_id", branchId)
    .order("date", { ascending: false });

  if (listError) {
    throw new ApiError(500, "Failed to compute monthly summaries");
  }

  const monthlyGroups = {};
  if (allTransactions) {
    for (const tx of allTransactions) {
      const txDate = new Date(tx.date);
      const year = txDate.getFullYear();
      const month = txDate.getMonth() + 1; // 1-indexed
      const key = `${year}-${month.toString().padStart(2, "0")}`;

      if (!monthlyGroups[key]) {
        monthlyGroups[key] = {
          year,
          month,
          income: 0,
          expense: 0,
          breakdownMap: {},
        };
      }

      const amt = Number(tx.amount);
      const categoryName = tx.category?.name || "Unknown";

      if (tx.type === "INCOME") {
        monthlyGroups[key].income += amt;
      } else {
        monthlyGroups[key].expense += amt;
      }

      const bdKey = `${categoryName}_${tx.type}`;
      if (!monthlyGroups[key].breakdownMap[bdKey]) {
        monthlyGroups[key].breakdownMap[bdKey] = {
          category: categoryName,
          type: tx.type,
          total: 0,
          count: 0,
        };
      }
      monthlyGroups[key].breakdownMap[bdKey].total += amt;
      monthlyGroups[key].breakdownMap[bdKey].count += 1;
    }
  }

  // Format monthly stats
  const monthlyStats = Object.values(monthlyGroups).map((m) => {
    const breakdown = Object.values(m.breakdownMap).sort(
      (a, b) => b.total - a.total
    );
    const item = {
      year: m.year,
      month: m.month,
      income: m.income,
      expense: m.expense,
      breakdown,
    };
    return item;
  });

  const result = {
    overall: {
      income: totalIncome,
      expense: totalExpense,
      balance: totalIncome - totalExpense,
    },
    monthlyStats,
  };

  return result;
};

// GET FINANCE CATEGORIES (Grouped Breakdown)
const getFinanceCategoriesService = async (branchId, userId, query) => {
  await requireBranchAdmin(branchId, userId);

  const { type } = query;

  let queryBuilder = supabase
    .from("branch_finances")
    .select(
      `
      id, type, amount, date,
      category:branch_finance_categories!category_id(id, name, type)
    `
    )
    .eq("branch_id", branchId);

  if (type === "INCOME" || type === "EXPENSE") {
    queryBuilder = queryBuilder.eq("type", type);
  }

  const { data: entries, error } = await queryBuilder;

  if (error) {
    throw new ApiError(500, "Failed to fetch categories breakdown");
  }

  const categoryMap = {};
  if (entries) {
    for (const entry of entries) {
      const catId = entry.category?.id;
      const catName = entry.category?.name || "Uncategorized";
      const catType = entry.category?.type || entry.type;

      if (!catId) continue;

      if (!categoryMap[catId]) {
        categoryMap[catId] = {
          id: catId,
          category: catName,
          type: catType,
          income: 0,
          expense: 0,
          balance: 0,
          count: 0,
        };
      }

      const amt = Number(entry.amount);
      categoryMap[catId].count += 1;

      if (entry.type === "INCOME") {
        categoryMap[catId].income += amt;
        categoryMap[catId].balance += amt;
      } else {
        categoryMap[catId].expense += amt;
        categoryMap[catId].balance -= amt;
      }
    }
  }

  // Convert to array, sort by absolute balance descending
  const categories = Object.values(categoryMap).sort(
    (a, b) => Math.abs(b.balance) - Math.abs(a.balance)
  );

  const result = { categories };
  return result;
};

// GET FINANCE MONTHLY EXPORT
const getFinanceMonthExportService = async (branchId, userId, query) => {
  await requireBranchAdmin(branchId, userId);

  const year = Number(query.year);
  const month = Number(query.month);

  if (!Number.isInteger(year) || year < 2000 || year > 3000) {
    throw new ApiError(400, "Year must be a valid number");
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ApiError(400, "Month must be between 1 and 12");
  }

  // Fetch all transactions in the branch
  const { data: entries, error } = await supabase
    .from("branch_finances")
    .select(
      `
      id, branch_id, type, amount, note, date, person_name, person_phone, details, created_at,
      recorded_by:users!recorded_by(id, full_name, user_name, avatar),
      category:branch_finance_categories!category_id(id, name, type)
    `
    )
    .eq("branch_id", branchId)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiError(500, "Failed to retrieve monthly entries");
  }

  // Filter in memory for specific year and month
  const filteredEntries = (entries || []).filter((entry) => {
    const entryDate = new Date(entry.date);
    const matchesYear = entryDate.getFullYear() === year;
    const matchesMonth = entryDate.getMonth() + 1 === month;
    return matchesYear && matchesMonth;
  });

  let incomeTotal = 0;
  let expenseTotal = 0;
  for (const entry of filteredEntries) {
    const amt = Number(entry.amount);
    if (entry.type === "INCOME") {
      incomeTotal += amt;
    } else {
      expenseTotal += amt;
    }
  }

  const result = {
    year,
    month,
    entries: filteredEntries,
    summary: {
      income: incomeTotal,
      expense: expenseTotal,
      balance: incomeTotal - expenseTotal,
      totalEntries: filteredEntries.length,
    },
  };

  return result;
};

// DELETE FINANCE ENTRY
// UPDATE FINANCE ENTRY
const updateFinanceEntryService = async (branchId, userId, entryId, data) => {
  await requireBranchAdmin(branchId, userId);

  // Check if entry exists for this branch
  const { data: existing, error: findError } = await supabase
    .from("branch_finances")
    .select("id")
    .eq("id", entryId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (findError || !existing) {
    throw new ApiError(
      404,
      "Finance entry not found or doesn't belong to this branch"
    );
  }

  const {
    type,
    amount,
    category_id,
    note,
    date,
    personName,
    personPhone,
    details,
  } = data;

  if (!type || amount === undefined || !category_id) {
    throw new ApiError(400, "Type, amount, and category_id are required");
  }

  if (type !== "INCOME" && type !== "EXPENSE") {
    throw new ApiError(400, "Type must be INCOME or EXPENSE");
  }

  const parsedAmount = Number(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new ApiError(400, "Amount must be greater than 0");
  }

  // Verify category exists and matches type and branch
  const { data: category, error: catError } = await supabase
    .from("branch_finance_categories")
    .select("id, type")
    .eq("id", category_id)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (catError || !category) {
    throw new ApiError(400, "Invalid category selected for this branch");
  }

  if (category.type !== type) {
    throw new ApiError(400, "Category type mismatch");
  }

  // Validate breakdown details if provided
  if (details && Array.isArray(details) && details.length > 0) {
    const detailsSum = details.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0
    );
    if (Math.abs(detailsSum - parsedAmount) > 0.01) {
      throw new ApiError(
        400,
        `Total amount (${parsedAmount}) does not match the sum of item details (${detailsSum}).`
      );
    }
  }

  const { data: updatedEntry, error: updateError } = await supabase
    .from("branch_finances")
    .update({
      type,
      amount: parsedAmount,
      category_id,
      note: note?.trim() || "",
      date: date ? new Date(date).toISOString() : new Date().toISOString(),
      person_name: personName?.trim() || "",
      person_phone: personPhone?.trim() || "",
      details: details?.length > 0 ? details : [],
    })
    .eq("id", entryId)
    .select(
      `
      id, branch_id, type, amount, note, date, person_name, person_phone, details, created_at,
      recorded_by:users!recorded_by(id, full_name, user_name, avatar),
      category:branch_finance_categories!category_id(id, name, type)
    `
    )
    .single();

  if (updateError || !updatedEntry) {
    throw new ApiError(
      500,
      updateError?.message || "Failed to update finance entry"
    );
  }

  const result = { entry: updatedEntry };
  return result;
};

const deleteFinanceEntryService = async (branchId, userId, entryId) => {
  await requireBranchAdmin(branchId, userId);

  const { data: entry, error: findError } = await supabase
    .from("branch_finances")
    .select("id")
    .eq("id", entryId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (findError || !entry) {
    throw new ApiError(
      404,
      "Finance entry not found or doesn't belong to this branch"
    );
  }

  const { error: deleteError } = await supabase
    .from("branch_finances")
    .delete()
    .eq("id", entryId);

  if (deleteError) {
    throw new ApiError(500, "Failed to delete finance entry");
  }

  const result = { entryId };
  return result;
};

const branchFinanceServices = {
  getCategoriesListService,
  createCategoryService,
  createFinanceEntryService,
  getFinanceEntriesService,
  getFinanceSummaryService,
  getFinanceCategoriesService,
  getFinanceMonthExportService,
  updateFinanceEntryService,
  deleteFinanceEntryService,
};

export default branchFinanceServices;
