import { supabase } from "../config/supabase.js";
import { ApiError } from "../utils/ApiError.js";
import { FINANCE_TYPES, PAYMENT_STATUS } from "../constants/finance.js";

// Helper to verify branch admin or moderator permissions or app administrator
const requireBranchAdmin = async (branchId, userId, options = {}) => {
  // 1. Fetch Branch
  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id, is_deleted, finance_action_code")
    .eq("id", branchId)
    .maybeSingle();

  if (branchError || !branch || branch.is_deleted) {
    throw new ApiError(404, "Branch not found or has been deleted");
  }

  // 2. Fetch User to check if App Admin
  const { data: user } = await supabase
    .from("users")
    .select("user_type")
    .eq("id", userId)
    .maybeSingle();

  const isAppAdmin = user?.user_type === "ADMIN";

  // 3. Fetch Membership role & allowed_category_ids
  let membership = null;
  const { data: memData, error: memErr } = await supabase
    .from("branch_memberships")
    .select("is_admin, is_moderator, allowed_category_ids")
    .eq("branch_id", branchId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memErr && memErr.code === "42703") {
    // Fallback if column not yet added
    const { data: fallbackMem } = await supabase
      .from("branch_memberships")
      .select("is_admin, is_moderator")
      .eq("branch_id", branchId)
      .eq("user_id", userId)
      .maybeSingle();
    membership = fallbackMem;
  } else {
    membership = memData;
  }

  const isAdmin = membership?.is_admin === true;
  const isModerator = membership?.is_moderator === true;
  const allowedCategoryIds = Array.isArray(membership?.allowed_category_ids)
    ? membership.allowed_category_ids
    : null;

  if (options.requireBranchStaff) {
    if (!isAdmin && !isModerator) {
      throw new ApiError(
        403,
        "Only branch administrators or moderators can perform this action"
      );
    }
  } else if (options.requireStrictAdmin) {
    if (!isAdmin && !isAppAdmin) {
      throw new ApiError(
        403,
        "Only branch admins or app administrators can perform this action"
      );
    }
  } else {
    if (!isAdmin && !isAppAdmin && !isModerator) {
      throw new ApiError(
        403,
        "Only branch admins, moderators or app administrators can access branch finance"
      );
    }
  }

  const result = {
    isAdmin,
    isAppAdmin,
    isModerator,
    allowedCategoryIds,
    branch,
  };
  return result;
};

// Helper to normalize entry object with due and payment fields
const mapEntryWithDue = (entry) => {
  if (!entry) return entry;
  const totalAmount = Number(
    entry.total_amount !== undefined && entry.total_amount !== null
      ? entry.total_amount
      : entry.amount
  );
  const paidAmount = Number(
    entry.paid_amount !== undefined && entry.paid_amount !== null
      ? entry.paid_amount
      : entry.amount
  );
  const dueAmount = Number(
    entry.due_amount !== undefined && entry.due_amount !== null
      ? entry.due_amount
      : 0
  );
  const paymentStatus =
    entry.payment_status ||
    (dueAmount > 0
      ? paidAmount > 0
        ? PAYMENT_STATUS.PARTIAL
        : PAYMENT_STATUS.DUE
      : PAYMENT_STATUS.PAID);

  const mapped = {
    ...entry,
    total_amount: totalAmount,
    paid_amount: paidAmount,
    due_amount: dueAmount,
    payment_status: paymentStatus,
  };
  return mapped;
};

// GET CATEGORIES LIST FOR SELECT BOX
const getCategoriesListService = async (branchId, userId) => {
  const { isAdmin, isAppAdmin, isModerator, allowedCategoryIds } =
    await requireBranchAdmin(branchId, userId);

  let query = supabase
    .from("branch_finance_categories")
    .select("id, name, type")
    .eq("branch_id", branchId)
    .order("name", { ascending: true });

  // If requester is a moderator with restricted categories, filter the list
  if (!isAdmin && !isAppAdmin && isModerator) {
    if (allowedCategoryIds && allowedCategoryIds.length > 0) {
      query = query.in("id", allowedCategoryIds);
    }
  }

  const { data: categories, error } = await query;

  if (error) {
    throw new ApiError(500, "Failed to fetch categories list");
  }

  const result = { categories: categories || [] };
  return result;
};

// CREATE A NEW CATEGORY FOR THE BRANCH
const createCategoryService = async (branchId, userId, { name, type }) => {
  const { isAdmin, isAppAdmin, isModerator, allowedCategoryIds } =
    await requireBranchAdmin(branchId, userId, { requireBranchStaff: true });

  // If a moderator is restricted to specific categories, they cannot create new categories
  if (!isAdmin && !isAppAdmin && isModerator) {
    if (allowedCategoryIds && allowedCategoryIds.length > 0) {
      throw new ApiError(
        403,
        "নির্দিষ্ট ক্যাটাগরিতে সীমাবদ্ধ মডারেটর নতুন ক্যাটাগরি তৈরি করতে পারবেন না।"
      );
    }
  }

  if (!name || !type) {
    throw new ApiError(400, "Category name and type are required");
  }

  if (type !== FINANCE_TYPES.INCOME && type !== FINANCE_TYPES.EXPENSE) {
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

// CREATE FINANCE ENTRY (WITH OPTIONAL DUE & PAYMENT STATUS)
const createFinanceEntryService = async (branchId, userId, data) => {
  const { isAdmin, isAppAdmin, isModerator, allowedCategoryIds } =
    await requireBranchAdmin(branchId, userId, { requireBranchStaff: true });

  const {
    type,
    amount,
    total_amount,
    paid_amount,
    payment_status,
    category_id,
    note,
    date,
    personName,
    personPhone,
    member_id,
    memberId,
    details,
  } = data;

  const rawAmount = total_amount !== undefined ? total_amount : amount;
  if (!type || rawAmount === undefined || !category_id) {
    throw new ApiError(400, "Type, amount, and category_id are required");
  }

  if (type !== FINANCE_TYPES.INCOME && type !== FINANCE_TYPES.EXPENSE) {
    throw new ApiError(400, "Type must be INCOME or EXPENSE");
  }

  const totalAmount = Number(rawAmount);
  if (isNaN(totalAmount) || totalAmount <= 0) {
    throw new ApiError(400, "Amount must be greater than 0");
  }

  // Calculate paid & due amounts based on payment_status
  let status = payment_status || PAYMENT_STATUS.PAID;
  let paidAmt = 0;
  let dueAmt = 0;

  if (status === PAYMENT_STATUS.PAID) {
    paidAmt = totalAmount;
    dueAmt = 0;
  } else if (status === PAYMENT_STATUS.DUE) {
    paidAmt = 0;
    dueAmt = totalAmount;
  } else if (status === PAYMENT_STATUS.PARTIAL) {
    paidAmt = Number(paid_amount);
    if (isNaN(paidAmt) || paidAmt < 0 || paidAmt >= totalAmount) {
      throw new ApiError(
        400,
        "For partial payment, paid amount must be >= 0 and less than total amount"
      );
    }
    dueAmt = totalAmount - paidAmt;
    if (dueAmt <= 0) {
      status = PAYMENT_STATUS.PAID;
      dueAmt = 0;
    }
  } else {
    status = PAYMENT_STATUS.PAID;
    paidAmt = totalAmount;
    dueAmt = 0;
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

  // Verify permission for restricted moderators
  if (!isAdmin && !isAppAdmin && isModerator) {
    if (allowedCategoryIds && allowedCategoryIds.length > 0) {
      if (!allowedCategoryIds.includes(category_id)) {
        throw new ApiError(
          403,
          "আপনার এই ক্যাটাগরিতে এন্ট্রি যোগ করার অনুমতি নেই।"
        );
      }
    }
  }

  // Validate breakdown details if provided
  if (details && Array.isArray(details) && details.length > 0) {
    const detailsSum = details.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0
    );
    if (Math.abs(detailsSum - totalAmount) > 0.01) {
      throw new ApiError(
        400,
        `Total amount (${totalAmount}) does not match the sum of item details (${detailsSum}).`
      );
    }
  }

  const finalMemberId = member_id || memberId || null;

  const basePayload = {
    branch_id: branchId,
    type,
    amount: totalAmount,
    total_amount: totalAmount,
    paid_amount: paidAmt,
    due_amount: dueAmt,
    payment_status: status,
    category_id,
    note: note?.trim() || "",
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
    recorded_by: userId,
    person_name: personName?.trim() || "",
    person_phone: personPhone?.trim() || "",
    member_id: finalMemberId,
    details: details?.length > 0 ? details : [],
  };

  const selectColsWithDue = `
    id, branch_id, type, amount, total_amount, paid_amount, due_amount, payment_status, note, date, person_name, person_phone, member_id, details, created_at,
    recorded_by:users!recorded_by(id, full_name, user_name, avatar),
    category:branch_finance_categories!category_id(id, name, type),
    member:branch_memberships!member_id(id, name, phone, serial_no)
  `;

  let entry = null;
  let { data: inserted, error: insertError } = await supabase
    .from("branch_finances")
    .insert(basePayload)
    .select(selectColsWithDue)
    .single();

  if (
    insertError &&
    (insertError.code === "42703" || insertError.code === "PGRST200")
  ) {
    // If member join or member_id column fails, retry without member join
    const selectWithoutMember = `
      id, branch_id, type, amount, total_amount, paid_amount, due_amount, payment_status, note, date, person_name, person_phone, details, created_at,
      recorded_by:users!recorded_by(id, full_name, user_name, avatar),
      category:branch_finance_categories!category_id(id, name, type)
    `;

    const payloadWithoutMember = { ...basePayload };
    delete payloadWithoutMember.member_id;

    const retryRes = await supabase
      .from("branch_finances")
      .insert(payloadWithoutMember)
      .select(selectWithoutMember)
      .single();

    if (!retryRes.error && retryRes.data) {
      inserted = retryRes.data;
      insertError = null;
    } else if (retryRes.error && retryRes.error.code === "42703") {
      // If due columns not yet added to DB, insert with fallback
      const fallbackPayload = {
        branch_id: branchId,
        type,
        amount: totalAmount,
        category_id,
        note: note?.trim() || "",
        date: date ? new Date(date).toISOString() : new Date().toISOString(),
        recorded_by: userId,
        person_name: personName?.trim() || "",
        person_phone: personPhone?.trim() || "",
        details: details?.length > 0 ? details : [],
      };
      const { data: fallbackInserted, error: fallbackError } = await supabase
        .from("branch_finances")
        .insert(fallbackPayload)
        .select(
          `
          id, branch_id, type, amount, note, date, person_name, person_phone, details, created_at,
          recorded_by:users!recorded_by(id, full_name, user_name, avatar),
          category:branch_finance_categories!category_id(id, name, type)
        `
        )
        .single();

      if (fallbackError || !fallbackInserted) {
        throw new ApiError(
          500,
          fallbackError?.message || "Failed to create finance entry"
        );
      }
      entry = mapEntryWithDue(fallbackInserted);
    }
  }

  if (!entry) {
    if (insertError || !inserted) {
      throw new ApiError(
        500,
        insertError?.message || "Failed to create finance entry"
      );
    }
    entry = mapEntryWithDue(inserted);
  }

  // Record initial payment record if paidAmt > 0 (silently fails if table not created yet)
  if (entry && paidAmt > 0) {
    await supabase.from("branch_finance_payments").insert({
      finance_id: entry.id,
      branch_id: branchId,
      amount: paidAmt,
      payment_date: entry.date,
      note: "Initial payment",
      recorded_by: userId,
    });
  }

  const result = { entry };
  return result;
};

// RECORD PAYMENT / DUE COLLECTION ON A TRANSACTION
const recordFinancePaymentService = async (branchId, userId, entryId, data) => {
  await requireBranchAdmin(branchId, userId);

  const { amount, date, note } = data;
  const paymentAmount = Number(amount);

  if (isNaN(paymentAmount) || paymentAmount <= 0) {
    throw new ApiError(400, "Payment amount must be greater than 0");
  }

  // Fetch target entry
  const { data: rawEntry, error: findError } = await supabase
    .from("branch_finances")
    .select(
      "id, branch_id, type, amount, total_amount, paid_amount, due_amount, payment_status, recorded_by"
    )
    .eq("id", entryId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (findError && findError.code === "42703") {
    throw new ApiError(
      400,
      "Due tracking is not yet active. Please run the SQL migration script in your Supabase SQL Editor."
    );
  }

  if (findError || !rawEntry) {
    throw new ApiError(
      404,
      "Finance entry not found or doesn't belong to this branch"
    );
  }

  const { isAppAdmin } = await requireBranchAdmin(branchId, userId, {
    requireBranchStaff: true,
  });

  if (!isAppAdmin && rawEntry.recorded_by !== userId) {
    throw new ApiError(
      403,
      "শুধুমাত্র যিনি এন্ট্রি করেছেন তিনিই বকেয়া আদায় বা পরিশোধ করতে পারবেন"
    );
  }

  const entry = mapEntryWithDue(rawEntry);
  const currentDue = entry.due_amount;

  if (currentDue <= 0) {
    throw new ApiError(400, "This transaction has already been fully paid");
  }

  if (paymentAmount > currentDue + 0.01) {
    throw new ApiError(
      400,
      `Payment amount (${paymentAmount}) exceeds the remaining due (${currentDue})`
    );
  }

  const newPaidAmount = entry.paid_amount + paymentAmount;
  const newDueAmount = Math.max(0, currentDue - paymentAmount);
  const newStatus =
    newDueAmount <= 0.001 ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PARTIAL;

  const paymentDate = date
    ? new Date(date).toISOString()
    : new Date().toISOString();

  // Insert payment history
  const { data: paymentRecord, error: payError } = await supabase
    .from("branch_finance_payments")
    .insert({
      finance_id: entryId,
      branch_id: branchId,
      amount: paymentAmount,
      payment_date: paymentDate,
      note: note?.trim() || "",
      recorded_by: userId,
    })
    .select(
      `
      id, finance_id, amount, payment_date, note, created_at,
      recorded_by:users!recorded_by(id, full_name, user_name, avatar)
    `
    )
    .maybeSingle();

  if (payError && payError.code !== "42P01") {
    throw new ApiError(500, payError.message || "Failed to record payment");
  }

  // Update entry due amounts and status
  const { data: updatedRaw, error: updateError } = await supabase
    .from("branch_finances")
    .update({
      paid_amount: newPaidAmount,
      due_amount: newDueAmount,
      payment_status: newStatus,
    })
    .eq("id", entryId)
    .select(
      `
      id, branch_id, type, amount, total_amount, paid_amount, due_amount, payment_status, note, date, person_name, person_phone, member_id, details, created_at,
      recorded_by:users!recorded_by(id, full_name, user_name, avatar),
      category:branch_finance_categories!category_id(id, name, type),
      member:branch_memberships!member_id(id, name, phone, serial_no)
    `
    )
    .single();

  let finalRaw = updatedRaw;
  if (updateError && (updateError.code === "42703" || updateError.code === "PGRST200")) {
    const { data: retryRaw, error: retryError } = await supabase
      .from("branch_finances")
      .select(
        `
        id, branch_id, type, amount, total_amount, paid_amount, due_amount, payment_status, note, date, person_name, person_phone, details, created_at,
        recorded_by:users!recorded_by(id, full_name, user_name, avatar),
        category:branch_finance_categories!category_id(id, name, type)
      `
      )
      .eq("id", entryId)
      .single();

    if (!retryError && retryRaw) {
      finalRaw = retryRaw;
    }
  } else if (updateError || !updatedRaw) {
    throw new ApiError(
      500,
      updateError?.message || "Failed to update entry due balance"
    );
  }

  const updatedEntry = mapEntryWithDue(finalRaw);
  const result = { entry: updatedEntry, payment: paymentRecord };
  return result;
};

// GET PAYMENT INSTALLMENTS HISTORY FOR A TRANSACTION
const getFinancePaymentsService = async (branchId, userId, entryId) => {
  await requireBranchAdmin(branchId, userId);

  const { data: payments, error } = await supabase
    .from("branch_finance_payments")
    .select(
      `
      id, finance_id, amount, payment_date, note, created_at,
      recorded_by:users!recorded_by(id, full_name, user_name, avatar)
    `
    )
    .eq("finance_id", entryId)
    .order("payment_date", { ascending: true });

  if (error && error.code === "42P01") {
    const emptyResult = { payments: [] };
    return emptyResult;
  }

  if (error) {
    throw new ApiError(500, "Failed to fetch payment history");
  }

  const result = { payments: payments || [] };
  return result;
};

// GET FINANCE ENTRIES (Paginated, Filtered & with Due/Payment info)
const getFinanceEntriesService = async (branchId, userId, query) => {
  const { member_id } = query;
  let isAllowed = false;
  try {
    await requireBranchAdmin(branchId, userId);
    isAllowed = true;
  } catch (err) {
    if (member_id) {
      const { data: selfMem } = await supabase
        .from("branch_memberships")
        .select("id, user_id, branch_id")
        .eq("id", member_id)
        .eq("branch_id", branchId)
        .eq("user_id", userId)
        .maybeSingle();

      if (selfMem) {
        isAllowed = true;
      }
    }
    if (!isAllowed) {
      throw err;
    }
  }

  const {
    type,
    category_id,
    payment_status,
    page = 1,
    limit = 20,
    startDate,
    endDate,
  } = query;

  const selectColsWithDue = `
    id, branch_id, type, amount, total_amount, paid_amount, due_amount, payment_status, note, date, person_name, person_phone, member_id, details, created_at,
    recorded_by:users!recorded_by(id, full_name, user_name, avatar),
    category:branch_finance_categories!category_id(id, name, type),
    member:branch_memberships!member_id(id, name, phone, serial_no)
  `;

  const selectColsFallback = `
    id, branch_id, type, amount, note, date, person_name, person_phone, details, created_at,
    recorded_by:users!recorded_by(id, full_name, user_name, avatar),
    category:branch_finance_categories!category_id(id, name, type)
  `;

  const parsedPage = Number(page);
  const parsedLimit = Number(limit);
  const from = (parsedPage - 1) * parsedLimit;
  const to = from + parsedLimit - 1;

  let useFallback = false;

  const buildQuery = (selectCols) => {
    let qb = supabase
      .from("branch_finances")
      .select(selectCols, { count: "exact" })
      .eq("branch_id", branchId);

    if (type === FINANCE_TYPES.INCOME || type === FINANCE_TYPES.EXPENSE) {
      qb = qb.eq("type", type);
    }

    if (category_id) {
      qb = qb.eq("category_id", category_id);
    }

    if (member_id && !useFallback) {
      qb = qb.eq("member_id", member_id);
    }

    if (payment_status && !useFallback) {
      if (payment_status === "HAS_DUE") {
        qb = qb.gt("due_amount", 0);
      } else if (
        payment_status === PAYMENT_STATUS.PAID ||
        payment_status === PAYMENT_STATUS.PARTIAL ||
        payment_status === PAYMENT_STATUS.DUE
      ) {
        qb = qb.eq("payment_status", payment_status);
      }
    }

    if (startDate) {
      qb = qb.gte("date", new Date(startDate).toISOString());
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      qb = qb.lte("date", end.toISOString());
    }

    qb = qb
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    return qb;
  };

  let { data: entries, error, count } = await buildQuery(selectColsWithDue);

  if (error && (error.code === "42703" || error.code === "PGRST200")) {
    useFallback = true;
    const fallbackRes = await buildQuery(selectColsFallback);
    entries = fallbackRes.data;
    error = fallbackRes.error;
    count = fallbackRes.count;
  }

  if (error) {
    throw new ApiError(500, error.message || "Failed to fetch finance entries");
  }

  const mappedEntries = (entries || []).map(mapEntryWithDue);
  const totalDocs = count ?? 0;
  const totalPages = Math.ceil(totalDocs / parsedLimit);

  const result = {
    entries: mappedEntries,
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

// GET FINANCE SUMMARY (Dashboard Overview with Cash, Due, Receivable & Payable)
const getFinanceSummaryService = async (branchId, userId) => {
  await requireBranchAdmin(branchId, userId);

  // 1. Fetch overall summary data
  let overallData = null;
  const { data: fullData, error: fullError } = await supabase
    .from("branch_finances")
    .select(
      "type, amount, total_amount, paid_amount, due_amount, payment_status, date"
    )
    .eq("branch_id", branchId);

  if (fullError && fullError.code === "42703") {
    const { data: basicData, error: basicError } = await supabase
      .from("branch_finances")
      .select("type, amount, date")
      .eq("branch_id", branchId);
    if (basicError) {
      throw new ApiError(500, "Failed to compute overall summary");
    }
    overallData = (basicData || []).map(mapEntryWithDue);
  } else if (fullError) {
    throw new ApiError(500, "Failed to compute overall summary");
  } else {
    overallData = (fullData || []).map(mapEntryWithDue);
  }

  let totalIncome = 0;
  let totalExpense = 0;
  let totalCashIn = 0;
  let totalCashOut = 0;
  let totalReceivable = 0;
  let totalPayable = 0;

  for (const item of overallData) {
    const totalAmt = Number(item.total_amount);
    const paidAmt = Number(item.paid_amount);
    const dueAmt = Number(item.due_amount);

    if (item.type === FINANCE_TYPES.INCOME) {
      totalIncome += totalAmt;
      totalCashIn += paidAmt;
      totalReceivable += dueAmt;
    } else {
      totalExpense += totalAmt;
      totalCashOut += paidAmt;
      totalPayable += dueAmt;
    }
  }

  const cashBalance = totalCashIn - totalCashOut;

  // 2. Fetch monthly stats
  let allTransactions = null;
  const { data: txWithDue, error: txDueError } = await supabase
    .from("branch_finances")
    .select(
      "type, amount, total_amount, paid_amount, due_amount, payment_status, date, category:branch_finance_categories!category_id(name)"
    )
    .eq("branch_id", branchId)
    .order("date", { ascending: false });

  if (txDueError && txDueError.code === "42703") {
    const { data: txBasic, error: txBasicErr } = await supabase
      .from("branch_finances")
      .select(
        "type, amount, date, category:branch_finance_categories!category_id(name)"
      )
      .eq("branch_id", branchId)
      .order("date", { ascending: false });
    if (txBasicErr) {
      throw new ApiError(500, "Failed to compute monthly summaries");
    }
    allTransactions = (txBasic || []).map(mapEntryWithDue);
  } else if (txDueError) {
    throw new ApiError(500, "Failed to compute monthly summaries");
  } else {
    allTransactions = (txWithDue || []).map(mapEntryWithDue);
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
          cash_in: 0,
          cash_out: 0,
          receivable: 0,
          payable: 0,
          breakdownMap: {},
        };
      }

      const totalAmt = Number(tx.total_amount);
      const paidAmt = Number(tx.paid_amount);
      const dueAmt = Number(tx.due_amount);
      const categoryName = tx.category?.name || "Unknown";

      if (tx.type === FINANCE_TYPES.INCOME) {
        monthlyGroups[key].income += totalAmt;
        monthlyGroups[key].cash_in += paidAmt;
        monthlyGroups[key].receivable += dueAmt;
      } else {
        monthlyGroups[key].expense += totalAmt;
        monthlyGroups[key].cash_out += paidAmt;
        monthlyGroups[key].payable += dueAmt;
      }

      const bdKey = `${categoryName}_${tx.type}`;
      if (!monthlyGroups[key].breakdownMap[bdKey]) {
        monthlyGroups[key].breakdownMap[bdKey] = {
          category: categoryName,
          type: tx.type,
          total: 0,
          paid: 0,
          due: 0,
          count: 0,
        };
      }
      monthlyGroups[key].breakdownMap[bdKey].total += totalAmt;
      monthlyGroups[key].breakdownMap[bdKey].paid += paidAmt;
      monthlyGroups[key].breakdownMap[bdKey].due += dueAmt;
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
      cash_in: m.cash_in,
      cash_out: m.cash_out,
      balance: m.cash_in - m.cash_out,
      receivable: m.receivable,
      payable: m.payable,
      breakdown,
    };
    return item;
  });

  const result = {
    overall: {
      income: totalIncome,
      expense: totalExpense,
      balance: cashBalance,
      total_cash_in: totalCashIn,
      total_cash_out: totalCashOut,
      total_receivable: totalReceivable,
      total_payable: totalPayable,
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
      id, type, amount, total_amount, paid_amount, due_amount, payment_status, date,
      category:branch_finance_categories!category_id(id, name, type)
    `
    )
    .eq("branch_id", branchId);

  if (type === FINANCE_TYPES.INCOME || type === FINANCE_TYPES.EXPENSE) {
    queryBuilder = queryBuilder.eq("type", type);
  }

  let { data: entries, error } = await queryBuilder;

  if (error && error.code === "42703") {
    const fallbackRes = await supabase
      .from("branch_finances")
      .select(
        `
        id, type, amount, date,
        category:branch_finance_categories!category_id(id, name, type)
      `
      )
      .eq("branch_id", branchId);
    entries = fallbackRes.data;
    error = fallbackRes.error;
  }

  if (error) {
    throw new ApiError(500, "Failed to fetch categories breakdown");
  }

  const parseYearMonth = (dateStr) => {
    if (typeof dateStr === "string" && dateStr.length >= 7) {
      const parts = dateStr.split("-");
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
        return {
          year: y,
          month: m,
          monthKey: `${y}-${m.toString().padStart(2, "0")}`,
        };
      }
    }
    const d = new Date(dateStr);
    const y = isNaN(d.getFullYear())
      ? new Date().getFullYear()
      : d.getFullYear();
    const m = isNaN(d.getMonth())
      ? new Date().getMonth() + 1
      : d.getMonth() + 1;
    return {
      year: y,
      month: m,
      monthKey: `${y}-${m.toString().padStart(2, "0")}`,
    };
  };

  const categoryMap = {};
  if (entries) {
    for (const raw of entries) {
      const entry = mapEntryWithDue(raw);
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
          paid: 0,
          due: 0,
          balance: 0,
          count: 0,
          monthsMap: {},
        };
      }

      const totalAmt = Number(entry.total_amount);
      const paidAmt = Number(entry.paid_amount);
      const dueAmt = Number(entry.due_amount);

      categoryMap[catId].count += 1;
      categoryMap[catId].paid += paidAmt;
      categoryMap[catId].due += dueAmt;

      if (entry.type === FINANCE_TYPES.INCOME) {
        categoryMap[catId].income += totalAmt;
        categoryMap[catId].balance += paidAmt;
      } else {
        categoryMap[catId].expense += totalAmt;
        categoryMap[catId].balance -= paidAmt;
      }

      // Group by month
      const { year, month, monthKey } = parseYearMonth(entry.date);
      if (!categoryMap[catId].monthsMap[monthKey]) {
        categoryMap[catId].monthsMap[monthKey] = {
          year,
          month,
          monthKey,
          income: 0,
          expense: 0,
          paid: 0,
          due: 0,
          balance: 0,
          count: 0,
        };
      }

      const m = categoryMap[catId].monthsMap[monthKey];
      m.count += 1;
      m.paid += paidAmt;
      m.due += dueAmt;

      if (entry.type === FINANCE_TYPES.INCOME) {
        m.income += totalAmt;
        m.balance += paidAmt;
      } else {
        m.expense += totalAmt;
        m.balance -= paidAmt;
      }
    }
  }

  // Convert to array, sort months descending, sort categories by absolute balance descending
  const categories = Object.values(categoryMap)
    .map((cat) => {
      const months = Object.values(cat.monthsMap).sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return b.month - a.month;
      });
      delete cat.monthsMap;
      return {
        ...cat,
        months,
      };
    })
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

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

  const selectCols = `
    id, branch_id, type, amount, total_amount, paid_amount, due_amount, payment_status, note, date, person_name, person_phone, member_id, details, created_at,
    recorded_by:users!recorded_by(id, full_name, user_name, avatar),
    category:branch_finance_categories!category_id(id, name, type),
    member:branch_memberships!member_id(id, name, phone, serial_no)
  `;

  let { data: entries, error } = await supabase
    .from("branch_finances")
    .select(selectCols)
    .eq("branch_id", branchId)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error && (error.code === "42703" || error.code === "PGRST200")) {
    const fallbackRes = await supabase
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
    entries = fallbackRes.data;
    error = fallbackRes.error;
  }

  if (error) {
    throw new ApiError(500, "Failed to retrieve monthly entries");
  }

  const mapped = (entries || []).map(mapEntryWithDue);

  // Filter for specific year and month
  const filteredEntries = mapped.filter((entry) => {
    const entryDate = new Date(entry.date);
    const matchesYear = entryDate.getFullYear() === year;
    const matchesMonth = entryDate.getMonth() + 1 === month;
    return matchesYear && matchesMonth;
  });

  let incomeTotal = 0;
  let expenseTotal = 0;
  let cashInTotal = 0;
  let cashOutTotal = 0;
  let receivableTotal = 0;
  let payableTotal = 0;

  for (const entry of filteredEntries) {
    const totalAmt = Number(entry.total_amount);
    const paidAmt = Number(entry.paid_amount);
    const dueAmt = Number(entry.due_amount);

    if (entry.type === FINANCE_TYPES.INCOME) {
      incomeTotal += totalAmt;
      cashInTotal += paidAmt;
      receivableTotal += dueAmt;
    } else {
      expenseTotal += totalAmt;
      cashOutTotal += paidAmt;
      payableTotal += dueAmt;
    }
  }

  const result = {
    year,
    month,
    entries: filteredEntries,
    summary: {
      income: incomeTotal,
      expense: expenseTotal,
      cash_in: cashInTotal,
      cash_out: cashOutTotal,
      balance: cashInTotal - cashOutTotal,
      receivable: receivableTotal,
      payable: payableTotal,
      totalEntries: filteredEntries.length,
    },
  };

  return result;
};

// UPDATE FINANCE ENTRY
const updateFinanceEntryService = async (
  branchId,
  userId,
  entryId,
  data,
  actionCode
) => {
  const { isAdmin, isAppAdmin, isModerator, allowedCategoryIds, branch } =
    await requireBranchAdmin(branchId, userId, { requireBranchStaff: true });

  // Check if entry exists for this branch
  const { data: existing, error: findError } = await supabase
    .from("branch_finances")
    .select(
      "id, category_id, recorded_by, amount, total_amount, paid_amount, due_amount, payment_status"
    )
    .eq("id", entryId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (findError || !existing) {
    throw new ApiError(
      404,
      "Finance entry not found or doesn't belong to this branch"
    );
  }

  // Only the creator can edit this entry
  if (!isAppAdmin && existing.recorded_by !== userId) {
    throw new ApiError(
      403,
      "শুধুমাত্র যিনি এন্ট্রি করেছেন তিনিই এটি এডিট করতে পারবেন"
    );
  }

  // Permission & Action Code Check:
  // Branch Admin: Can edit directly (no code required).
  // Moderator: Must provide the branch's finance_action_code.
  if (!isAdmin) {
    if (isModerator) {
      const requiredCode = branch?.finance_action_code || "1234";
      const providedCode =
        typeof actionCode === "string" ? actionCode.trim() : "";
      if (!providedCode || providedCode !== requiredCode) {
        throw new ApiError(
          403,
          "ভুল সিকিউরিটি কোড! এন্ট্রি এডিট করতে ব্রাঞ্চ এডমিনের অনুমোদিত কোড প্রয়োজন।"
        );
      }
    } else {
      throw new ApiError(
        403,
        "শুধুমাত্র ব্রাঞ্চ এডমিন বা অনুমোদিত মডারেটর এডিট করতে পারবেন"
      );
    }
  }

  const {
    type,
    amount,
    total_amount,
    paid_amount,
    payment_status,
    category_id,
    note,
    date,
    personName,
    personPhone,
    member_id,
    memberId,
    details,
  } = data;

  const rawAmount = total_amount !== undefined ? total_amount : amount;
  if (!type || rawAmount === undefined || !category_id) {
    throw new ApiError(400, "Type, amount, and category_id are required");
  }

  if (type !== FINANCE_TYPES.INCOME && type !== FINANCE_TYPES.EXPENSE) {
    throw new ApiError(400, "Type must be INCOME or EXPENSE");
  }

  const totalAmount = Number(rawAmount);
  if (isNaN(totalAmount) || totalAmount <= 0) {
    throw new ApiError(400, "Amount must be greater than 0");
  }

  // Calculate status & due
  let status = payment_status || existing.payment_status || PAYMENT_STATUS.PAID;
  let paidAmt = Number(
    paid_amount !== undefined
      ? paid_amount
      : existing.paid_amount !== undefined
        ? existing.paid_amount
        : totalAmount
  );
  if (status === PAYMENT_STATUS.PAID) {
    paidAmt = totalAmount;
  } else if (status === PAYMENT_STATUS.DUE) {
    paidAmt = 0;
  }

  const dueAmt = Math.max(0, totalAmount - paidAmt);
  if (dueAmt <= 0) {
    status = PAYMENT_STATUS.PAID;
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

  // Verify permission for restricted moderators
  if (!isAdmin && !isAppAdmin && isModerator) {
    if (allowedCategoryIds && allowedCategoryIds.length > 0) {
      if (
        !allowedCategoryIds.includes(category_id) ||
        !allowedCategoryIds.includes(existing.category_id)
      ) {
        throw new ApiError(
          403,
          "আপনার এই ক্যাটাগরির এন্ট্রি পরিবর্তন করার অনুমতি নেই।"
        );
      }
    }
  }

  // Validate breakdown details if provided
  if (details && Array.isArray(details) && details.length > 0) {
    const detailsSum = details.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0
    );
    if (Math.abs(detailsSum - totalAmount) > 0.01) {
      throw new ApiError(
        400,
        `Total amount (${totalAmount}) does not match the sum of item details (${detailsSum}).`
      );
    }
  }

  const updatePayload = {
    type,
    amount: totalAmount,
    total_amount: totalAmount,
    paid_amount: paidAmt,
    due_amount: dueAmt,
    payment_status: status,
    category_id,
    note: note?.trim() || "",
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
    person_name: personName?.trim() || "",
    person_phone: personPhone?.trim() || "",
    details: details?.length > 0 ? details : [],
  };

  if (member_id !== undefined || memberId !== undefined) {
    updatePayload.member_id = member_id || memberId || null;
  }

  const selectCols = `
    id, branch_id, type, amount, total_amount, paid_amount, due_amount, payment_status, note, date, person_name, person_phone, member_id, details, created_at,
    recorded_by:users!recorded_by(id, full_name, user_name, avatar),
    category:branch_finance_categories!category_id(id, name, type),
    member:branch_memberships!member_id(id, name, phone, serial_no)
  `;

  let updatedEntry = null;
  let { data: updatedRaw, error: updateError } = await supabase
    .from("branch_finances")
    .update(updatePayload)
    .eq("id", entryId)
    .select(selectCols)
    .single();

  if (
    updateError &&
    (updateError.code === "42703" || updateError.code === "PGRST200")
  ) {
    const selectWithoutMember = `
      id, branch_id, type, amount, total_amount, paid_amount, due_amount, payment_status, note, date, person_name, person_phone, details, created_at,
      recorded_by:users!recorded_by(id, full_name, user_name, avatar),
      category:branch_finance_categories!category_id(id, name, type)
    `;

    const retryPayload = { ...updatePayload };
    delete retryPayload.member_id;

    const retryRes = await supabase
      .from("branch_finances")
      .update(retryPayload)
      .eq("id", entryId)
      .select(selectWithoutMember)
      .single();

    if (!retryRes.error && retryRes.data) {
      updatedRaw = retryRes.data;
      updateError = null;
    } else if (retryRes.error && retryRes.error.code === "42703") {
      const fallbackPayload = {
        type,
        amount: totalAmount,
        category_id,
        note: note?.trim() || "",
        date: date ? new Date(date).toISOString() : new Date().toISOString(),
        person_name: personName?.trim() || "",
        person_phone: personPhone?.trim() || "",
        details: details?.length > 0 ? details : [],
      };
      const { data: fallbackUpdated, error: fallbackError } = await supabase
        .from("branch_finances")
        .update(fallbackPayload)
        .eq("id", entryId)
        .select(
          `
          id, branch_id, type, amount, note, date, person_name, person_phone, details, created_at,
          recorded_by:users!recorded_by(id, full_name, user_name, avatar),
          category:branch_finance_categories!category_id(id, name, type)
        `
        )
        .single();

      if (fallbackError || !fallbackUpdated) {
        throw new ApiError(
          500,
          fallbackError?.message || "Failed to update finance entry"
        );
      }
      updatedEntry = mapEntryWithDue(fallbackUpdated);
    }
  }

  if (!updatedEntry) {
    if (updateError || !updatedRaw) {
      throw new ApiError(
        500,
        updateError?.message || "Failed to update finance entry"
      );
    }
    updatedEntry = mapEntryWithDue(updatedRaw);
  }

  const result = { entry: updatedEntry };
  return result;
};

// DELETE FINANCE ENTRY
const deleteFinanceEntryService = async (
  branchId,
  userId,
  entryId,
  actionCode
) => {
  const { isAdmin, isAppAdmin, isModerator, allowedCategoryIds, branch } =
    await requireBranchAdmin(branchId, userId, { requireBranchStaff: true });

  const { data: entry, error: findError } = await supabase
    .from("branch_finances")
    .select("id, recorded_by, category_id")
    .eq("id", entryId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (findError || !entry) {
    throw new ApiError(
      404,
      "Finance entry not found or doesn't belong to this branch"
    );
  }

  // Only the creator can delete this entry
  if (!isAppAdmin && entry.recorded_by !== userId) {
    throw new ApiError(
      403,
      "শুধুমাত্র যিনি এন্ট্রি করেছেন তিনিই এটি ডিলিট করতে পারবেন"
    );
  }

  // Verify permission for restricted moderators
  if (!isAdmin && !isAppAdmin && isModerator) {
    if (allowedCategoryIds && allowedCategoryIds.length > 0) {
      if (!allowedCategoryIds.includes(entry.category_id)) {
        throw new ApiError(
          403,
          "আপনার এই ক্যাটাগরির এন্ট্রি ডিলিট করার অনুমতি নেই।"
        );
      }
    }
  }

  // Permission & Action Code Check:
  // Branch Admin: Can delete directly (no code required).
  // Moderator: Must provide the branch's finance_action_code.
  if (!isAdmin) {
    if (isModerator) {
      const requiredCode = branch?.finance_action_code || "1234";
      const providedCode =
        typeof actionCode === "string" ? actionCode.trim() : "";
      if (!providedCode || providedCode !== requiredCode) {
        throw new ApiError(
          403,
          "ভুল সিকিউরিটি কোড! এন্ট্রি ডিলিট করতে ব্রাঞ্চ এডমিনের অনুমোদিত কোড প্রয়োজন।"
        );
      }
    } else {
      throw new ApiError(
        403,
        "শুধুমাত্র ব্রাঞ্চ এডমিন বা অনুমোদিত মডারেটর ডিলিট করতে পারবেন"
      );
    }
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

// GET BRANCH ACTION CODE (Branch Admin only)
const getBranchActionCodeService = async (branchId, userId) => {
  const { isAdmin, branch } = await requireBranchAdmin(branchId, userId);

  if (!isAdmin) {
    throw new ApiError(
      403,
      "শুধুমাত্র ব্রাঞ্চ এডমিন এই সিকিউরিটি কোড দেখতে পারবেন"
    );
  }

  const actionCode = branch?.finance_action_code || "1234";
  const result = { actionCode };
  return result;
};

// UPDATE BRANCH ACTION CODE (Branch Admin only)
const updateBranchActionCodeService = async (branchId, userId, newCode) => {
  const { isAdmin } = await requireBranchAdmin(branchId, userId);

  if (!isAdmin) {
    throw new ApiError(
      403,
      "শুধুমাত্র ব্রাঞ্চ এডমিন সিকিউরিটি কোড পরিবর্তন করতে পারবেন"
    );
  }

  const trimmedCode = typeof newCode === "string" ? newCode.trim() : "";
  if (!trimmedCode || trimmedCode.length < 4 || trimmedCode.length > 20) {
    throw new ApiError(400, "কোড অবশ্যই ৪ থেকে ২০ অক্ষরের মধ্যে হতে হবে");
  }

  const { error: updateError } = await supabase
    .from("branches")
    .update({ finance_action_code: trimmedCode })
    .eq("id", branchId);

  if (updateError) {
    throw new ApiError(500, "Failed to update branch action code");
  }

  const result = { actionCode: trimmedCode };
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
  recordFinancePaymentService,
  getFinancePaymentsService,
  getBranchActionCodeService,
  updateBranchActionCodeService,
};

export default branchFinanceServices;
