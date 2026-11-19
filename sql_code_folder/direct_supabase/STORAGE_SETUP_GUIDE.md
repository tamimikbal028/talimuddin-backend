# Supabase Storage Manual Setup Instructions

যেহেতু Storage Buckets ও Policies আপনি ম্যানুয়ালি Supabase Dashboard থেকে তৈরি করবেন, তাই [`Frontend/src/services/common/fileUpload.service.ts`](file:///e:/WebApp/Deploy/Talimuddin/Frontend/src/services/common/fileUpload.service.ts) কোডের সাথে মিল রেখে নিচের ২টি Bucket এবং তাদের Policy সেটআপ করুন।

---

## ১. Buckets তৈরি করা (Supabase Dashboard → Storage → New bucket)

নিচের exact নামে **২টি Public Bucket** তৈরি করুন:

1. **`profile_assets`**
   - **Public bucket:** ON (Checked)
   - _(অবশ্যই exact নাম `profile_assets` হতে হবে)_

2. **`branch_assets`**
   - **Public bucket:** ON (Checked)
   - _(অবশ্যই exact নাম `branch_assets` হতে হবে)_

> **নোট:** কোডে ছবি আপলোডের path ফরম্যাট:
>
> - `profile_assets`: `{userId}/avatar/{timestamp}_{filename}`
> - `branch_assets`: `{branchId}/cover/{timestamp}_{filename}`

---

## ২. Storage Policies সেটআপ করা (Storage → Policies)

প্রতিটি bucket-এর জন্য **SELECT, INSERT, UPDATE, DELETE** policy দিন (Dashboard-এ **New Policy → For full customization** থেকে):

### A) `profile_assets` Bucket Policies

1. **Public Read (`SELECT`)**
   - Allowed operation: `SELECT`
   - Target roles: `public` (অথবা `anon, authenticated`)
   - USING expression:

     ```sql
     bucket_id = 'profile_assets'
     ```

2. **Owner Upload (`INSERT`)**
   - Allowed operation: `INSERT`
   - Target roles: `authenticated`
   - WITH CHECK expression:

     ```sql
     bucket_id = 'profile_assets'
     AND (storage.foldername(name))[1] = auth.uid()::text
     ```

3. **Owner Update (`UPDATE`)**
   - Allowed operation: `UPDATE`
   - Target roles: `authenticated`
   - USING expression:

     ```sql
     bucket_id = 'profile_assets'
     AND (storage.foldername(name))[1] = auth.uid()::text
     ```

4. **Owner Delete (`DELETE`)**
   - Allowed operation: `DELETE`
   - Target roles: `authenticated`
   - USING expression:

     ```sql
     bucket_id = 'profile_assets'
     AND (storage.foldername(name))[1] = auth.uid()::text
     ```

---

### B) `branch_assets` Bucket Policies

_(এই policy গুলো আপনার ডাটাবেসের `public.is_app_admin()` এবং `public.is_branch_admin(...)` ফাংশন ব্যবহার করবে — তাই আগে SQL ফাইলটি রান করা থাকতে হবে)_

1. **Public Read (`SELECT`)**
   - Allowed operation: `SELECT`
   - Target roles: `public` (অথবা `anon, authenticated`)
   - USING expression:

     ```sql
     bucket_id = 'branch_assets'
     ```

2. **Branch Admin / App Admin Upload (`INSERT`)**
   - Allowed operation: `INSERT`
   - Target roles: `authenticated`
   - WITH CHECK expression:

     ```sql
     bucket_id = 'branch_assets'
     AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND (
       public.is_app_admin()
       OR public.is_branch_admin(((storage.foldername(name))[1])::uuid)
     )
     ```

3. **Branch Admin / App Admin Update (`UPDATE`)**
   - Allowed operation: `UPDATE`
   - Target roles: `authenticated`
   - USING expression:

     ```sql
     bucket_id = 'branch_assets'
     AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND (
       public.is_app_admin()
       OR public.is_branch_admin(((storage.foldername(name))[1])::uuid)
     )
     ```

4. **Branch Admin / App Admin Delete (`DELETE`)**
   - Allowed operation: `DELETE`
   - Target roles: `authenticated`
   - USING expression:

     ```sql
     bucket_id = 'branch_assets'
     AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND (
       public.is_app_admin()
       OR public.is_branch_admin(((storage.foldername(name))[1])::uuid)
     )
     ```
