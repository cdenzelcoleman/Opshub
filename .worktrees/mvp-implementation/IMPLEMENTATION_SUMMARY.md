# Task 8: Ticket CRUD Routes Implementation

## Summary

Successfully implemented the complete Ticket CRUD routes for the Ops Hub API with status transition validation, filtering, and pagination.

## Files Created/Modified

### Created
- **`apps/api/src/routes/tickets.js`** (429 lines)
  - Complete ticket management routes with CRUD operations
  - Status transition validation helper function
  - Pagination and filtering support
  - Role-based access control
  - Audit logging for all operations

### Modified
- **`apps/api/src/app.js`**
  - Added import for ticketRoutes
  - Mounted ticket routes at `/api/orgs`

## Implemented Endpoints

### 1. GET /api/orgs/:orgId/tickets
**List tickets with filtering and pagination**
- Query parameters:
  - `status`: Filter by status (OPEN, PENDING_APPROVAL, APPROVED, IN_PROGRESS, RESOLVED, CLOSED)
  - `assigneeId`: Filter by assignee
  - `creatorId`: Filter by creator
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 10, max: 100)
- Returns paginated list with pagination metadata
- Requires: Authentication

Example:
```bash
curl -X GET "http://localhost:3000/api/orgs/org-123/tickets?status=OPEN&page=1&limit=10" \
  -H "Authorization: Bearer <token>"
```

### 2. POST /api/orgs/:orgId/tickets
**Create new ticket**
- Request body:
  ```json
  {
    "title": "Ticket title",
    "description": "Detailed description",
    "assigneeId": "user-id (optional)",
    "requiresApproval": false
  }
  ```
- Response: Created ticket with full details
- Requires: Authentication
- Auto-creates: OPEN status, sets creator

Example:
```bash
curl -X POST "http://localhost:3000/api/orgs/org-123/tickets" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix login bug",
    "description": "Users cannot login with special characters",
    "requiresApproval": true
  }'
```

### 3. GET /api/orgs/:orgId/tickets/:ticketId
**Get ticket details**
- Returns: Full ticket with creator, assignee, approver, and attachments
- Requires: Authentication
- Requires: User is member of organization

Example:
```bash
curl -X GET "http://localhost:3000/api/orgs/org-123/tickets/ticket-456" \
  -H "Authorization: Bearer <token>"
```

### 4. PATCH /api/orgs/:orgId/tickets/:ticketId
**Update ticket with status transition validation**
- Request body (all optional):
  ```json
  {
    "title": "Updated title",
    "description": "Updated description",
    "status": "IN_PROGRESS",
    "assigneeId": "user-id or null",
    "requiresApproval": true
  }
  ```
- Status transitions validated based on current status
- Title/description updates require ADMIN+ role
- VIEWER role cannot change status
- Auto-sets: resolvedAt (RESOLVED), closedAt (CLOSED)
- Creates: Audit log with old/new values

Example:
```bash
curl -X PATCH "http://localhost:3000/api/orgs/org-123/tickets/ticket-456" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "IN_PROGRESS"}'
```

### 5. DELETE /api/orgs/:orgId/tickets/:ticketId
**Delete ticket**
- Requires: Authentication + ADMIN/OWNER role
- Cascades: Deletes attachments
- Creates: Audit log entry

Example:
```bash
curl -X DELETE "http://localhost:3000/api/orgs/org-123/tickets/ticket-456" \
  -H "Authorization: Bearer <token>"
```

## Status Transition Rules

Valid transitions defined in `validateStatusTransition()`:

| From | To |
|------|-----|
| OPEN | PENDING_APPROVAL, IN_PROGRESS, CLOSED |
| PENDING_APPROVAL | APPROVED, REJECTED, OPEN |
| APPROVED | IN_PROGRESS, CLOSED |
| IN_PROGRESS | RESOLVED, CLOSED |
| RESOLVED | CLOSED |
| CLOSED | (none - terminal state) |

## Security Features

1. **Authentication Required**: All endpoints require valid JWT token
2. **Organization Access**: `requireOrg` middleware ensures user is org member
3. **Role-Based Authorization**:
   - ADMIN/OWNER required for: title/description updates, deletion
   - VIEWER cannot change status
4. **Data Validation**: Zod schema validation on all inputs
5. **Foreign Key Validation**: Assignee membership verified before assignment

## Audit Logging

All operations logged with metadata:
- **TICKET_CREATED**: title, requiresApproval, assigneeId
- **STATUS_CHANGED**: oldStatus, newStatus
- **TICKET_UPDATED**: title, description, assigneeId, requiresApproval changes
- Deleted: title of deleted ticket

## Error Handling

- 400: Validation errors (invalid input, invalid transitions)
- 401: Unauthorized (missing/invalid token)
- 403: Forbidden (not org member, insufficient role, viewer status change)
- 404: Ticket not found
- 500: Server errors (logged)

## Database Models Used

- **Ticket**: id, title, description, organizationId, status, requiresApproval
- **User**: creator, assignee, approver relations
- **Organization**: organization ownership
- **Attachment**: related attachments for tickets
- **AuditLog**: operation tracking

## Commit Information

**Commit SHA**: d3f1373aa45762976ab33ad15352dd3b1924b2ad

**Commit Message**:
```
feat(api): implement ticket CRUD routes with status transition validation

- Implement GET /api/orgs/:orgId/tickets with filtering & pagination
- Implement POST /api/orgs/:orgId/tickets for ticket creation
- Implement GET /api/orgs/:orgId/tickets/:ticketId for ticket details
- Implement PATCH /api/orgs/:orgId/tickets/:ticketId with status validation
- Implement DELETE /api/orgs/:orgId/tickets/:ticketId (admin only)
- Add validateStatusTransition helper function
- Ticket status transitions validated: OPEN->IN_PROGRESS/PENDING_APPROVAL/CLOSED
- Support filtering by status, assignee, creator with pagination
- Create audit logs for all ticket operations
- Mount ticket routes in app.js
```

## Testing Notes

Manual testing can be performed using the provided `test-tickets-curl.sh` script which includes:
- Ticket creation
- Listing with pagination
- Listing with filters
- Detail retrieval
- Valid status transitions
- Invalid transition rejection
- Title/description updates
- Deletion with proper authorization

## Implementation Details

### validateStatusTransition Helper
- Defined at line 16 of tickets.js
- Validates state machine transitions
- Blocks VIEWER role from status changes
- Throws ValidationError with valid transition details

### Data Validation
- All inputs validated with Zod schemas
- Assignee membership verified in organization
- Status enums validated against TicketStatus enum from database schema
- Pagination limits enforced (max 100 items per page)

### Relationships Maintained
- Ticket creator auto-set to current user
- Assignee must be organization member
- Approver tracked separately (for approval workflows)
- All timestamps (createdAt, resolvedAt, closedAt) managed correctly

## No Deviations from Plan

All requirements implemented exactly as specified in Task 8:
✓ GET /api/orgs/:orgId/tickets with filtering & pagination
✓ POST /api/orgs/:orgId/tickets (create)
✓ GET /api/orgs/:orgId/tickets/:ticketId (detail)
✓ PATCH /api/orgs/:orgId/tickets/:ticketId with status transition validation
✓ DELETE /api/orgs/:orgId/tickets/:ticketId (delete)
✓ validateStatusTransition helper function
✓ Routes mounted in app.js
✓ Audit logging for all operations
✓ Role-based access control
