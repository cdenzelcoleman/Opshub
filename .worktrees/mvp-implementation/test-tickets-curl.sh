#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
API_URL="http://localhost:3000"
ORG_ID="test-org-123"
TICKET_ID=""
USER_TOKEN=""

echo -e "${YELLOW}Ticket CRUD Routes Test${NC}"
echo "================================"
echo ""

# Test 1: Create a ticket
echo -e "${YELLOW}Test 1: Create a ticket${NC}"
echo "POST /api/orgs/:orgId/tickets"
RESPONSE=$(curl -s -X POST "$API_URL/api/orgs/$ORG_ID/tickets" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{
    "title": "Fix login bug",
    "description": "Users cannot login with special characters in password",
    "requiresApproval": true
  }')
echo "Response: $RESPONSE"
echo ""

# Test 2: List tickets with pagination
echo -e "${YELLOW}Test 2: List tickets with pagination${NC}"
echo "GET /api/orgs/:orgId/tickets?page=1&limit=10"
RESPONSE=$(curl -s -X GET "$API_URL/api/orgs/$ORG_ID/tickets?page=1&limit=10" \
  -H "Authorization: Bearer $USER_TOKEN")
echo "Response: $RESPONSE"
echo ""

# Test 3: List tickets with status filter
echo -e "${YELLOW}Test 3: List tickets with status filter${NC}"
echo "GET /api/orgs/:orgId/tickets?status=OPEN"
RESPONSE=$(curl -s -X GET "$API_URL/api/orgs/$ORG_ID/tickets?status=OPEN" \
  -H "Authorization: Bearer $USER_TOKEN")
echo "Response: $RESPONSE"
echo ""

# Test 4: Get ticket details
echo -e "${YELLOW}Test 4: Get ticket details${NC}"
echo "GET /api/orgs/:orgId/tickets/:ticketId"
RESPONSE=$(curl -s -X GET "$API_URL/api/orgs/$ORG_ID/tickets/$TICKET_ID" \
  -H "Authorization: Bearer $USER_TOKEN")
echo "Response: $RESPONSE"
echo ""

# Test 5: Update ticket status (valid transition)
echo -e "${YELLOW}Test 5: Update ticket status (OPEN -> IN_PROGRESS)${NC}"
echo "PATCH /api/orgs/:orgId/tickets/:ticketId"
RESPONSE=$(curl -s -X PATCH "$API_URL/api/orgs/$ORG_ID/tickets/$TICKET_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{
    "status": "IN_PROGRESS"
  }')
echo "Response: $RESPONSE"
echo ""

# Test 6: Update ticket status (invalid transition)
echo -e "${YELLOW}Test 6: Update ticket status (invalid transition - IN_PROGRESS -> OPEN)${NC}"
echo "PATCH /api/orgs/:orgId/tickets/:ticketId"
RESPONSE=$(curl -s -X PATCH "$API_URL/api/orgs/$ORG_ID/tickets/$TICKET_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{
    "status": "OPEN"
  }')
echo "Response: $RESPONSE"
echo ""

# Test 7: Update ticket title and description
echo -e "${YELLOW}Test 7: Update ticket title and description${NC}"
echo "PATCH /api/orgs/:orgId/tickets/:ticketId"
RESPONSE=$(curl -s -X PATCH "$API_URL/api/orgs/$ORG_ID/tickets/$TICKET_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{
    "title": "Updated title",
    "description": "Updated description"
  }')
echo "Response: $RESPONSE"
echo ""

# Test 8: Delete ticket (ADMIN only)
echo -e "${YELLOW}Test 8: Delete ticket (ADMIN only)${NC}"
echo "DELETE /api/orgs/:orgId/tickets/:ticketId"
RESPONSE=$(curl -s -X DELETE "$API_URL/api/orgs/$ORG_ID/tickets/$TICKET_ID" \
  -H "Authorization: Bearer $USER_TOKEN")
echo "Response: $RESPONSE"
echo ""

# Test 9: Try to delete with non-admin user (should fail)
echo -e "${YELLOW}Test 9: Delete ticket with viewer role (should fail)${NC}"
echo "DELETE /api/orgs/:orgId/tickets/:ticketId"
RESPONSE=$(curl -s -X DELETE "$API_URL/api/orgs/$ORG_ID/tickets/$TICKET_ID" \
  -H "Authorization: Bearer $VIEWER_TOKEN")
echo "Response: $RESPONSE"
echo ""

echo -e "${YELLOW}Tests completed!${NC}"
