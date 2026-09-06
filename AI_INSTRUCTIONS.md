# AI Project Instructions - Backend

This file is dedicated to storing the core structure, specific coding conventions, and architectural context for the **Backend** of the Bidda project.

By keeping your instructions here, any AI assistant (like me) can consistently follow your project's rules without you having to repeat them in every conversation.

---

## 🏗️ Project Architecture & Folder Structure

_(Describe how your Node.js/Express backend is organized here. Example below:)_

- `src/controllers/`: Route request handlers.
- `src/services/`: Business logic and database interactions.
- `src/models/`: Mongoose/Database schemas.
- `src/routes/`: API route definitions.
- `src/middlewares/`: Custom middlewares (e.g., Auth, Error handling).
- `src/utils/`: Utility functions (e.g., AsyncHandler, ApiError, ApiResponse).

## 🛠️ Tech Stack & Conventions

_(List your primary tools and coding rules here)_

- **Framework:** Node.js + Express
- **Database:** MongoDB + Mongoose (Dual Database Architecture: Main DB + Gaming DB)
- **Error Handling:** (e.g., "Always wrap controller functions in `AsyncHandler`")
- **Response Format:** (e.g., "Always return responses using the standard `ApiResponse` class")

## 🗄️ Database Architecture (Dual DB)

To keep the system scalable and decoupled, the project uses two separate databases within the same MongoDB cluster:

1.  **Main DB (`mongoose.connection`):** Stores core application data (Users, Posts, Institutions, Branches, etc.). All models in `src/models/` (except `gaming/`) use this by default.
2.  **Gaming DB (`gamingDB`):** Stores all gaming-related data (Scores, Experience, Matches, Inventory, etc.). 
    -   All gaming-related models must be placed in `src/models/gaming/`.
    -   Gaming models **MUST** be defined using `gamingDB.model()` instead of `mongoose.model()`.
    -   Import `gamingDB` from `src/config/database.js`.

## 📌 Specific AI Rules

_(Add any strict rules you want the AI to ALWAYS follow)_

1. Always use `AsyncHandler` for every new controller.
2. Never expose sensitive data (like passwords) in API responses.
3. Every controller must have a corresponding `.service.js` file in the `src/services/` folder. All business logic and database interactions must be put within the service file, while the controller only handles the request extraction and API response.
4. All files in the `src/utils/` folder must use `PascalCase` for their filenames (e.g., `AsyncHandler.js`), and the functions or classes exported from them must also follow `PascalCase`.
5. Any constants used within service files must be extracted into a dedicated file in the `src/constants/` folder and imported from there, rather than being hardcoded in the service file.
6. Service files MUST NOT export functions directly (e.g., `export const myFunc = ...`). Instead, define all functions normally, group them in a single object at the bottom of the file (e.g., `const moduleServices = { ... };`), and `export default moduleServices;`. Controllers should import this object and call its methods (e.g., `moduleServices.myFunc()`).
7. Controller files MUST ALSO follow the exact same pattern as service files. Group all controller functions in a single object at the bottom and export it as default (e.g., `const moduleControllers = { ... }; export default moduleControllers;`). Route files should import this default object and map their routes to its methods (e.g., `router.route('/').get(moduleControllers.myFunc);`).
8. Data passing between Service and Controller MUST ALWAYS use objects. Service functions must return data as an object (e.g., `return { post, meta };`). Controller functions must receive this data by destructuring the object (e.g., `const { post, meta } = await myService();`). When sending the response in the Controller, you MUST use the full response structure returning `.status(code)` and `.json()` containing the `ApiResponse` instance, passing the main payload inside an object (e.g., `return res.status(200).json(new ApiResponse(200, { post, meta }, "Success message"));`).
9. **Response Data Structure**: Data payloads must strictly adhere to a consistent 3-part structure whenever applicable:
   - `[mainDataKey]` (e.g., `user`, `posts`, `institution`): The core data fetched directly from the database.
   - `meta` (optional): Any additional, calculated, or relational fields not directly present in the DB query (e.g., `isFollowing`, `canEdit`).
   - `pagination` (optional): If the response is paginated, this must be a separate object with the exact following fields in order: `{ totalDocs, limit, page, totalPages, hasPrevPage, hasNextPage }`.
     _Nested Array Pattern_: If the main data is an array (like a list of posts), each element in the array must also follow this structure internally (e.g., returning an array of objects like `[{ post: {...}, meta: {...} }, ...]`).
10. **Variable Pre-definition**: Never define or compute values inline inside a `return` statement. Always define all variables and computed values before the `return`, then simply reference them in the returned object. This keeps code readable and debuggable.
11. **Plural Naming for Export Objects**: The exported object in every service and controller file must always be named in **plural** form. Examples: `authServices`, `branchServices`, `institutionControllers`, `groupControllers`. Never use singular (e.g., `authService` or `authController` is wrong).

## 🚀 Current Focus & Notes

_(Write down what you are currently working on so the AI has immediate context)_

- Currently refining the Gaming controllers.
- ...

---

**How to use:** Just tell the AI: _"Read the `AI_INSTRUCTIONS.md` file in the Backend folder before you start"_ and the AI will understand your exact requirements.
