# Task Relationships Testing Protocol

## Overview
This document outlines the testing protocol for the newly implemented parent-child task relationships and explore action in the Archon MCP system.

**Branch**: `claude-fast-task-explore`  
**Date**: 2025-01-05  
**Features to Test**: Parent-child task relationships, explore action, task querying

## Prerequisites

1. Ensure you're on the `claude-fast-task-explore` branch
2. Start the Archon MCP server
3. Have a test project ID ready (or create one)

## Test Scenarios

### 1. Basic Parent-Child Task Creation

#### Test 1.1: Create a Parent Task
```python
# MCP Command
mcp__archon__manage_task(
    action="create",
    project_id="[YOUR_PROJECT_ID]",
    title="Parent Task: Implement User Authentication",
    description="Main task for implementing complete user authentication system",
    assignee="backend-engineer",
    task_order=1,
    feature="authentication"
)
```
**Expected Result**: 
- Task created successfully
- Returns task with ID (save as PARENT_TASK_ID)
- No parent_task_id field in response

#### Test 1.2: Create First Child Task
```python
# MCP Command
mcp__archon__manage_task(
    action="create",
    project_id="[YOUR_PROJECT_ID]",
    parent_task_id="[PARENT_TASK_ID]",
    title="Child 1: Setup OAuth2 Provider",
    description="Configure Google OAuth2 authentication provider",
    assignee="backend-engineer",
    task_order=1,
    feature="authentication"
)
```
**Expected Result**: 
- Task created successfully
- Returns task with parent_task_id = PARENT_TASK_ID
- Save returned ID as CHILD_1_ID

#### Test 1.3: Create Second Child Task
```python
# MCP Command
mcp__archon__manage_task(
    action="create",
    project_id="[YOUR_PROJECT_ID]",
    parent_task_id="[PARENT_TASK_ID]",
    title="Child 2: Implement JWT Token Management",
    description="Create JWT token generation and validation",
    assignee="backend-engineer",
    task_order=2,
    feature="authentication"
)
```
**Expected Result**: 
- Task created successfully
- Returns task with parent_task_id = PARENT_TASK_ID
- Save returned ID as CHILD_2_ID

#### Test 1.4: Create Third Child Task
```python
# MCP Command
mcp__archon__manage_task(
    action="create",
    project_id="[YOUR_PROJECT_ID]",
    parent_task_id="[PARENT_TASK_ID]",
    title="Child 3: Create Login UI Components",
    description="Build React login form and authentication UI",
    assignee="frontend-specialist",
    task_order=3,
    feature="authentication"
)
```
**Expected Result**: 
- Task created successfully
- Returns task with parent_task_id = PARENT_TASK_ID
- Save returned ID as CHILD_3_ID

### 2. Explore Action Testing

#### Test 2.1: Explore from Parent Task
```python
# MCP Command
mcp__archon__manage_task(
    action="explore",
    task_id="[PARENT_TASK_ID]"
)
```
**Expected Result**:
```json
{
    "success": true,
    "parent_task": {
        "id": "[PARENT_TASK_ID]",
        "title": "Parent Task: Implement User Authentication",
        "description": "Main task for implementing complete user authentication system",
        "parent_task_id": null,
        ...
    },
    "children": [
        { "id": "[CHILD_1_ID]", "title": "Child 1: Setup OAuth2 Provider", ... },
        { "id": "[CHILD_2_ID]", "title": "Child 2: Implement JWT Token Management", ... },
        { "id": "[CHILD_3_ID]", "title": "Child 3: Create Login UI Components", ... }
    ],
    "total_children": 3,
    "context": {
        "requested_task_id": "[PARENT_TASK_ID]",
        "root_task_id": "[PARENT_TASK_ID]",
        "is_parent": true
    }
}
```

#### Test 2.2: Explore from Child Task (Should Return Same Family)
```python
# MCP Command
mcp__archon__manage_task(
    action="explore",
    task_id="[CHILD_2_ID]"  # Using middle child
)
```
**Expected Result**:
```json
{
    "success": true,
    "parent_task": {
        "id": "[PARENT_TASK_ID]",
        "title": "Parent Task: Implement User Authentication",
        ...
    },
    "children": [
        { "id": "[CHILD_1_ID]", ... },
        { "id": "[CHILD_2_ID]", ... },
        { "id": "[CHILD_3_ID]", ... }
    ],
    "total_children": 3,
    "context": {
        "requested_task_id": "[CHILD_2_ID]",
        "root_task_id": "[PARENT_TASK_ID]",
        "is_parent": false
    }
}
```

#### Test 2.3: Explore Non-Existent Task
```python
# MCP Command
mcp__archon__manage_task(
    action="explore",
    task_id="non-existent-id-123"
)
```
**Expected Result**:
```json
{
    "success": false,
    "error": "Task non-existent-id-123 not found"
}
```

#### Test 2.4: Explore Standalone Task (No Parent, No Children)
```python
# First create a standalone task
mcp__archon__manage_task(
    action="create",
    project_id="[YOUR_PROJECT_ID]",
    title="Standalone Task: Update Documentation",
    description="A task with no parent or children",
    assignee="content-copywriter"
)
# Save ID as STANDALONE_ID

# Then explore it
mcp__archon__manage_task(
    action="explore",
    task_id="[STANDALONE_ID]"
)
```
**Expected Result**:
```json
{
    "success": true,
    "parent_task": {
        "id": "[STANDALONE_ID]",
        "title": "Standalone Task: Update Documentation",
        "parent_task_id": null,
        ...
    },
    "children": [],
    "total_children": 0,
    "context": {
        "requested_task_id": "[STANDALONE_ID]",
        "root_task_id": "[STANDALONE_ID]",
        "is_parent": true
    }
}
```

### 3. List/Query Testing

#### Test 3.1: List All Tasks in Project
```python
# MCP Command
mcp__archon__manage_task(
    action="list",
    filter_by="project",
    filter_value="[YOUR_PROJECT_ID]"
)
```
**Expected Result**: 
- Should return all tasks including parent and children
- Each child should have parent_task_id field
- Parent should have parent_task_id as null

#### Test 3.2: List Only Children of a Parent
```python
# MCP Command (using API directly since MCP might need adjustment)
# GET /api/tasks?parent_task_id=[PARENT_TASK_ID]
```
**Expected Result**: 
- Should return only the 3 child tasks
- Should NOT include the parent task itself

### 4. Edge Cases

#### Test 4.1: Create Nested Children (Grandchild)
```python
# MCP Command
mcp__archon__manage_task(
    action="create",
    project_id="[YOUR_PROJECT_ID]",
    parent_task_id="[CHILD_1_ID]",  # Child 1 becomes a parent
    title="Grandchild: Configure Google OAuth Settings",
    description="Detailed OAuth configuration task",
    assignee="backend-engineer"
)
```
**Expected Result**: 
- Task created with parent_task_id = CHILD_1_ID
- Save ID as GRANDCHILD_ID

#### Test 4.2: Explore Grandchild (Should Return Immediate Parent)
```python
# MCP Command
mcp__archon__manage_task(
    action="explore",
    task_id="[GRANDCHILD_ID]"
)
```
**Expected Result**:
- Should return CHILD_1 as parent_task
- Should return GRANDCHILD in children array
- Should NOT return original PARENT_TASK or other children

### 5. Status Workflow Testing

#### Test 5.1: Update Child Task Status
```python
# MCP Command
mcp__archon__manage_task(
    action="update",
    task_id="[CHILD_1_ID]",
    update_fields={"status": "doing"}
)
```
**Expected Result**: 
- Task status updated successfully
- Parent task status remains unchanged

#### Test 5.2: Archive Parent Task
```python
# MCP Command
mcp__archon__manage_task(
    action="archive",
    task_id="[PARENT_TASK_ID]"
)
```
**Expected Result**: 
- Parent task archived
- All child tasks should also be archived (cascade)
- Check subtasks_archived count in response

## Error Scenarios to Test

1. **Missing parent_task_id**: Try to explore without providing task_id
2. **Invalid parent_task_id**: Create task with non-existent parent_task_id
3. **Circular reference**: Try to set a task's parent to itself (if possible)
4. **Cross-project parent**: Try to create child in different project than parent

## Validation Checklist

- [ ] Parent-child tasks can be created successfully
- [ ] Explore action works from parent task
- [ ] Explore action works from any child task
- [ ] Explore returns all siblings when called on a child
- [ ] Standalone tasks can be explored
- [ ] Nested children (grandchildren) work correctly
- [ ] Task status updates don't affect parent/child relationships
- [ ] Archiving parent archives all children
- [ ] API endpoint supports parent_task_id filter
- [ ] Error handling works for invalid task IDs
- [ ] MCP tool properly passes parent_task_id parameter

## Notes for Testing

1. **Save IDs**: Keep track of all created task IDs for reference
2. **Project Cleanup**: After testing, you may want to delete the test project
3. **Console Logs**: Watch server logs for any errors or warnings
4. **Frontend Testing**: These tests focus on backend only; frontend will be tested separately

## Test Results

### Pass/Fail Summary
- [x] Test 1.1: Create Parent Task - **PASS** ✅
- [x] Test 1.2: Create First Child - **PASS** ✅
- [x] Test 1.3: Create Second Child - **PASS** ✅
- [x] Test 1.4: Create Third Child - **PASS** ✅
- [x] Test 2.1: Explore from Parent - **PASS** ✅
- [x] Test 2.2: Explore from Child - **PASS** ✅
- [x] Test 2.3: Explore Non-Existent - **PASS** ✅
- [x] Test 2.4: Explore Standalone - **PASS** ✅
- [x] Test 3.1: List All Tasks - **PASS** ✅
- [x] Test 3.2: List Children Only - **ISSUE** ⚠️
- [x] Test 4.1: Create Grandchild - **PASS** ✅
- [x] Test 4.2: Explore Grandchild - **PASS** ✅
- [ ] Test 5.1: Update Child Status - NOT TESTED
- [ ] Test 5.2: Archive Parent - NOT TESTED

### Issues Found
1. **List Filter Issue**: The `filter_by="parent"` and `filter_by="parent_task_id"` filters don't work as expected through the MCP tool. They return all tasks instead of filtering by parent_task_id. This may require backend adjustment in the filter logic implementation.

2. **Grandchild Behavior**: When exploring from a grandchild task, it returns only the immediate parent and its children, not the entire hierarchy up to the root. This is actually correct and expected behavior for a direct parent-child relationship model.

### Additional Notes
- The explore action is working perfectly for discovering task families
- Parent-child relationship creation is robust and error-free
- The context object in explore responses is very helpful for understanding relationships
- Task order is being adjusted automatically (parent task_order changed from 100 to 103)
- Error handling for non-existent tasks is properly implemented
- The renamed action from "explorer" to "explore" is cleaner and working correctly

---

**Testing completed by**: Claude (AI Assistant)  
**Date completed**: 2025-01-05  
**Next steps**: Fix the list filter issue, then proceed with frontend implementation