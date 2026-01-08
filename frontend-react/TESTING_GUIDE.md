# Complete Integration Testing Guide

## Backend and Frontend-React Integration

This guide will help you test all the integrated features from your friend's HTML/CSS/JS frontend and backend in your new React frontend.

---

## Prerequisites

### Backend Setup

1. Ensure backend is running on `http://localhost:8000`
2. Database should be initialized with tables
3. CORS should be configured to allow `http://localhost:5173` (Vite dev server)

### Frontend Setup

1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Frontend will be available at `http://localhost:5173`

---

## Test Scenarios

### 1. Admin Login ✅

**Test Flow:**

1. Navigate to `http://localhost:5173/admin/login`
2. Enter credentials:
   - Username: `admin`
   - Password: `admin123` (or configured admin password)
3. Click "Sign in"

**Expected Results:**

- ✅ Shows "Logging in..." message
- ✅ Success toast notification appears
- ✅ Redirected to `/admin` dashboard (AdminDashboard)
- ✅ Token stored in localStorage under `cxp_auth`

**What Gets Tested:**

- AdminLogin component integration
- Backend `/api/auth/admin/login` endpoint
- JWT token handling
- Auth context state management
- Session persistence

---

### 2. Company Registration ✅

**Test Flow:**

1. Navigate to `http://localhost:5173/company/register`
2. Fill in form:
   - Company Name: `Tech Innovations Ltd`
   - Username: `techinnovations`
   - Email: `admin@techinnovations.com`
   - Password: `SecurePass123`
   - Confirm Password: `SecurePass123`
   - Logo URL (optional): `https://example.com/logo.png`
3. Click "Register"

**Expected Results:**

- ✅ Form validation shows errors if fields incomplete
- ✅ Password mismatch error if passwords don't match
- ✅ Password length validation (minimum 6 characters)
- ✅ Success message: "Registered successfully. Waiting for admin approval."
- ✅ Auto-redirect to company login after 1.2 seconds
- ✅ Company created in database with `status='pending'`

**What Gets Tested:**

- CompanyRegister form validation
- Backend `/api/auth/company/register` endpoint
- Form state management
- Navigation flow

---

### 3. Company Login ✅

**Test Flow:**

1. Navigate to `http://localhost:5173/company/login`
2. Enter credentials (from registration above):
   - Username: `techinnovations`
   - Password: `SecurePass123`
3. Click "Sign in"

**Expected Results:**

- ✅ Shows "Signing in..." message
- ✅ Success toast: "Login successful"
- ✅ Redirected to `/company` dashboard (CompanyDashboard)
- ✅ Token stored with `userType='company'`

**Note:** This will only work if the company was approved by admin first. If not approved, you'll get error: "Company account is pending admin approval"

**What Gets Tested:**

- CompanyLogin component
- Backend `/api/auth/company/login` endpoint
- User type handling
- Error messages for non-approved companies

---

### 4. Admin Dashboard - Companies Tab ✅

**Prerequisites:**

- Admin is logged in
- At least one company exists in database (from registration test)

**Test Flow:**

1. Navigate to `/admin` (should auto-redirect if accessing without auth)
2. Select status filter from dropdown:
   - "Pending" - shows companies awaiting approval
   - "Approved" - shows approved companies
   - "Rejected" - shows rejected companies
   - "All" - shows all companies
3. Click "Refresh" button

**Expected Results:**

- ✅ Companies table loads with columns: Name, Username, Email, Status, Registered, Actions
- ✅ Status badges show with correct colors
- ✅ Filter dropdown changes visible companies
- ✅ "View Drives" button shows drive count for each company

**What Gets Tested:**

- AdminDashboard component
- Backend `/api/admin/companies` endpoint with filters
- Data binding and rendering
- UI responsiveness

---

### 5. Admin - Approve Company ✅

**Prerequisites:**

- Admin logged in
- A pending company exists in "Pending" filter

**Test Flow:**

1. In "Pending" companies section
2. Find a company from registration test
3. Click "Approve" button
4. Confirm action

**Expected Results:**

- ✅ Success toast: "Company approved successfully"
- ✅ Company moves from "Pending" to "Approved" section
- ✅ Button changes to "Suspend" for approved companies
- ✅ Backend updates `company.status = 'approved'`

**What Gets Tested:**

- Backend `/api/admin/companies/{id}/approve` endpoint
- State updates after approval
- UI button changes based on status

---

### 6. Admin - Reject Company ✅

**Prerequisites:**

- Admin logged in
- At least one pending company

**Test Flow:**

1. Click "Reject" button on a pending company
2. A browser prompt asks for rejection reason
3. Enter reason or leave empty
4. Click OK

**Expected Results:**

- ✅ Success toast: "Company rejected successfully"
- ✅ Company moves to "Rejected" section
- ✅ Reason stored in `admin_notes` field

**What Gets Tested:**

- Backend `/api/admin/companies/{id}/reject` endpoint
- Rejection workflow
- Notes/reason storage

---

### 7. Admin - View Company Drives ✅

**Prerequisites:**

- Admin logged in
- A company has created drives (from company dashboard)

**Test Flow:**

1. Click "View Drives" button on any company
2. Modal opens showing drives table
3. Each drive shows: Title, Type, Duration, Status, Questions, Students, Created date

**Expected Results:**

- ✅ Modal displays all drives for selected company
- ✅ Drives show question count and student count
- ✅ Can view student list for each drive

**What Gets Tested:**

- Modal component
- Backend `/api/company/drives` with `X-Company-ID` header
- Cross-company data access by admin

---

### 8. Admin - View Drive Students ✅

**Prerequisites:**

- Admin viewing company drives
- A drive has enrolled students

**Test Flow:**

1. Click "View Students" in drive modal
2. Students modal opens showing enrolled students

**Expected Results:**

- ✅ Modal shows student list with: Roll Number, Name, Email, College, Group, Batch Year
- ✅ Search box filters students in real-time
- ✅ Student count shown at top

**What Gets Tested:**

- Nested modal functionality
- Backend `/api/company/drives/{driveId}/students` with admin access
- Search/filter functionality

---

### 9. Company Dashboard - Create Drive ✅

**Prerequisites:**

- Company is logged in
- Backend has colleges and student groups available

**Test Flow:**

1. Click "Create New Drive" button on dashboard
2. Fill in drive form:
   - Title: `Summer Internship 2025`
   - Description: `Recruitment drive for summer internship program`
   - Type: Select "Technical"
   - Duration: `120` minutes
   - Scheduled Start (optional): Select date/time or leave empty
3. Add Target Audience:
   - College: Select from dropdown
   - Student Group: Select from dropdown
   - Batch Year: `2025` (optional)
   - Click "Add Target" button
4. Click "Create Drive"

**Expected Results:**

- ✅ Drive created in "Draft" status
- ✅ Success toast: "Drive created successfully"
- ✅ Drive appears in drives list
- ✅ Can see buttons to Edit, Submit, Delete

**What Gets Tested:**

- CompanyDashboard create form
- Target audience selection
- Backend `/api/company/drives` POST endpoint
- Drive status workflow

---

### 10. Company Dashboard - Edit Drive ✅

**Prerequisites:**

- Company logged in
- A drive exists in "Draft" status

**Test Flow:**

1. Click "Edit" button on a draft drive
2. Change drive details:
   - Title: Add " (Updated)" to existing title
   - Description: Modify description
   - Duration: Change to `90` minutes
3. Click "Create Drive" button to save

**Expected Results:**

- ✅ Drive updated successfully
- ✅ Updated information visible in drives list
- ✅ Can still edit until submitted

**What Gets Tested:**

- Drive editing functionality
- Backend `/api/company/drives/{id}` PUT endpoint
- Form pre-population with existing data

---

### 11. Company Dashboard - Add Questions ✅

**Prerequisites:**

- Company logged in
- A drive is created and not submitted

**Test Flow:**

1. Click "Add Questions" for a drive
2. In Questions section, click "Add Question"
3. Fill question form:
   - Question Text: `What is the capital of India?`
   - Option A: `New Delhi`
   - Option B: `Mumbai`
   - Option C: `Bangalore`
   - Option D: `Kolkata`
   - Correct Answer: `A`
   - Difficulty: `Easy`
   - Points: `1`
4. Click "Add Question" button

**Expected Results:**

- ✅ Question added to questions list
- ✅ Success toast: "Question added successfully"
- ✅ Question appears in table with all details
- ✅ Can add multiple questions

**What Gets Tested:**

- Backend `/api/company/drives/{driveId}/questions` POST endpoint
- Question form validation
- Questions list rendering

---

### 12. Company Dashboard - Submit Drive ✅

**Prerequisites:**

- Company logged in
- Drive exists with at least one question and target audience added
- Drive is in "Draft" status

**Test Flow:**

1. Click "Submit" button on a draft drive
2. Confirmation dialog: "Submit this drive for admin approval?"
3. Click OK

**Expected Results:**

- ✅ Success toast: "Drive submitted for approval!"
- ✅ Drive status changes to "Submitted"
- ✅ "Submit" button disappears
- ✅ Message shows: "Waiting for admin approval..."

**What Gets Tested:**

- Backend `/api/company/drives/{id}/submit` PUT endpoint
- Drive status workflow
- Conditional UI rendering

---

### 13. Company Dashboard - Delete Drive ✅

**Prerequisites:**

- Company logged in
- A draft drive exists that can be deleted

**Test Flow:**

1. Click "Delete" button on a draft drive
2. Confirmation: "Delete this drive? This action cannot be undone."
3. Click OK

**Expected Results:**

- ✅ Success toast: "Drive deleted successfully"
- ✅ Drive removed from list
- ✅ Dashboard stats updated

**What Gets Tested:**

- Backend `/api/company/drives/{id}` DELETE endpoint
- Destructive action confirmation
- List refresh after deletion

---

### 14. Company Dashboard - Duplicate Drive ✅

**Prerequisites:**

- Company logged in
- A drive exists (any status)

**Test Flow:**

1. Click "Copy" or "Copy & Resubmit" button on a drive
2. Confirmation dialog appears
3. Click OK

**Expected Results:**

- ✅ Success toast: "Drive duplicated"
- ✅ New drive appears in list with same title but status "Draft"
- ✅ All questions and targets copied to new drive
- ✅ Can edit and submit the copy

**What Gets Tested:**

- Backend `/api/company/drives/{id}/duplicate` POST endpoint
- Data cloning functionality
- Workflow for resubmitting rejected drives

---

### 15. Authentication - Session Persistence ✅

**Test Flow:**

1. Login to dashboard (admin or company)
2. Token is stored in localStorage
3. Refresh the page (press F5)
4. Check if still authenticated without login

**Expected Results:**

- ✅ Page loads without login redirect
- ✅ Dashboard content loads immediately
- ✅ User context maintained
- ✅ Token still valid in Authorization header

**What Gets Tested:**

- LocalStorage persistence
- AuthContext initialization from stored token
- Token attachment in API requests

---

### 16. Authentication - Logout ✅

**Test Flow:**

1. While logged in, find logout button/option
2. Click logout

**Expected Results:**

- ✅ Token cleared from localStorage
- ✅ User context cleared
- ✅ Redirected to home page
- ✅ Toast: "Logged out"
- ✅ Cannot access protected pages

**What Gets Tested:**

- Logout functionality
- Auth cleanup
- Protected route behavior

---

### 17. Error Handling - Invalid Login ✅

**Test Flow:**

1. Try to login with wrong credentials
2. Username or password incorrect

**Expected Results:**

- ✅ Error message from backend displayed
- ✅ Toast error notification
- ✅ Page stays on login form
- ✅ User can retry

**What Gets Tested:**

- Error message handling
- Backend validation
- UX for authentication failures

---

### 18. Error Handling - Unauthorized Access ✅

**Test Flow:**

1. Admin tries to access `/company` dashboard
2. Or company tries to access `/admin` dashboard

**Expected Results:**

- ✅ Redirected to home page
- ✅ RequireAuth component validates user type
- ✅ No access to protected content

**What Gets Tested:**

- Role-based access control
- RequireAuth component
- Protected route security

---

## API Endpoint Checklist

Use this to verify all endpoints are working:

### Auth Endpoints

- [ ] `POST /api/auth/admin/login` - Admin login
- [ ] `POST /api/auth/company/login` - Company login
- [ ] `POST /api/auth/company/register` - Company registration

### Admin Endpoints

- [ ] `GET /api/admin/companies` - List companies (with filter)
- [ ] `PUT /api/admin/companies/{id}/approve` - Approve company
- [ ] `PUT /api/admin/companies/{id}/reject` - Reject company
- [ ] `GET /api/admin/drives` - List all drives (with filter)
- [ ] `GET /api/company/drives?X-Company-ID=id` - Admin viewing company drives

### Company Endpoints

- [ ] `GET /api/company/drives` - List company drives
- [ ] `POST /api/company/drives` - Create drive
- [ ] `GET /api/company/drives/{id}` - Get drive details
- [ ] `PUT /api/company/drives/{id}` - Update drive
- [ ] `DELETE /api/company/drives/{id}` - Delete drive
- [ ] `PUT /api/company/drives/{id}/submit` - Submit for approval
- [ ] `POST /api/company/drives/{id}/duplicate` - Duplicate drive
- [ ] `GET /api/company/drives/{id}/questions` - List questions
- [ ] `POST /api/company/drives/{id}/questions` - Add question
- [ ] `GET /api/company/colleges` - List colleges
- [ ] `GET /api/company/student-groups` - List student groups

---

## Debugging Tips

### Check Browser Console

- Look for errors in browser DevTools (F12 > Console)
- Check network requests (F12 > Network)
- Verify token in localStorage (F12 > Application > LocalStorage)

### Check Backend Logs

- Look for API request logs
- Check for validation errors
- Verify database updates

### Common Issues

**Issue: CORS Error**

- Solution: Ensure backend CORS includes frontend domain

**Issue: 401 Unauthorized**

- Solution: Check token in localStorage, re-login if expired

**Issue: 404 Not Found**

- Solution: Verify backend endpoints exist and spelling matches

**Issue: Form doesn't submit**

- Solution: Check browser console for validation errors
- Check network tab to see request details

---

## Integration Status

| Component          | Status      | Tested |
| ------------------ | ----------- | ------ |
| AdminLogin         | ✅ Complete | -      |
| CompanyLogin       | ✅ Complete | -      |
| CompanyRegister    | ✅ Complete | -      |
| AdminDashboard     | ✅ Complete | -      |
| CompanyDashboard   | ✅ Complete | -      |
| AuthContext        | ✅ Complete | -      |
| API Integration    | ✅ Complete | -      |
| Error Handling     | ✅ Complete | -      |
| Session Management | ✅ Complete | -      |

---

## Next Steps After Testing

1. ✅ Verify all endpoints respond correctly
2. ✅ Test edge cases (empty lists, large datasets)
3. ✅ Test on mobile devices for responsiveness
4. ✅ Verify dark mode styling works
5. ✅ Test with different browsers
6. ✅ Check performance with Network throttling
7. ✅ Set up production environment variables
8. ✅ Configure proper API base URL for production

---

## Success Criteria

- ✅ All authentication flows work
- ✅ Admin can manage companies and drives
- ✅ Companies can create and manage drives
- ✅ Data persists in database correctly
- ✅ Error handling is user-friendly
- ✅ Session persists across page refreshes
- ✅ All forms validate properly
- ✅ Responsive design works on all devices

**All criteria met = Integration Complete! 🎉**
