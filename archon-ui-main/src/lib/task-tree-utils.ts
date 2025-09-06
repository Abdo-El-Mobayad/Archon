// Define Task interface to match the UI components
export interface Task {
  id: string;
  parent_task_id?: string;
  title: string;
  description: string;
  status: 'backlog' | 'in-progress' | 'review' | 'complete' | 'todo' | 'doing' | 'done';
  assignee: string | { name: string; avatar: string };
  feature?: string;
  featureColor?: string;
  task_order: number;
  [key: string]: any; // Allow additional properties
}

export interface TaskNode extends Task {
  children: TaskNode[];
  isExpanded?: boolean;
  depth?: number;
}

/**
 * Builds a hierarchical tree structure from a flat list of tasks
 * @param tasks - Flat array of tasks
 * @returns Array of root tasks with nested children
 */
export function buildTaskTree(tasks: Task[]): TaskNode[] {
  const taskMap = new Map<string, TaskNode>();
  const rootTasks: TaskNode[] = [];

  // First pass: Create TaskNode for each task
  tasks.forEach(task => {
    taskMap.set(task.id, {
      ...task,
      children: [],
      isExpanded: true, // Default to expanded
      depth: 0
    });
  });

  // Second pass: Build the tree structure
  tasks.forEach(task => {
    const taskNode = taskMap.get(task.id)!;
    
    if (task.parent_task_id) {
      // This task has a parent
      const parentNode = taskMap.get(task.parent_task_id);
      if (parentNode) {
        parentNode.children.push(taskNode);
        taskNode.depth = (parentNode.depth || 0) + 1;
      } else {
        // Parent not found, treat as root
        rootTasks.push(taskNode);
      }
    } else {
      // No parent, this is a root task
      rootTasks.push(taskNode);
    }
  });

  // Sort children by task_order
  const sortChildren = (nodes: TaskNode[]) => {
    nodes.sort((a, b) => a.task_order - b.task_order);
    nodes.forEach(node => sortChildren(node.children));
  };

  sortChildren(rootTasks);

  return rootTasks;
}

/**
 * Flattens a task tree into a flat array, preserving hierarchy order
 * @param taskNodes - Array of task nodes (tree structure)
 * @param expandedIds - Set of task IDs that are expanded
 * @returns Flat array of tasks in hierarchical order
 */
export function flattenTaskTree(
  taskNodes: TaskNode[], 
  expandedIds: Set<string> = new Set()
): TaskNode[] {
  const result: TaskNode[] = [];

  const traverse = (nodes: TaskNode[], depth: number = 0) => {
    nodes.forEach(node => {
      const nodeWithDepth = { ...node, depth };
      result.push(nodeWithDepth);
      
      // Only include children if the parent is expanded
      if (expandedIds.has(node.id) || node.isExpanded) {
        traverse(node.children, depth + 1);
      }
    });
  };

  traverse(taskNodes);
  return result;
}

/**
 * Gets all descendant task IDs for a given task
 * @param taskId - The parent task ID
 * @param tasks - All tasks
 * @returns Array of descendant task IDs
 */
export function getDescendantIds(taskId: string, tasks: Task[]): string[] {
  const descendants: string[] = [];
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  
  const findDescendants = (parentId: string) => {
    tasks.forEach(task => {
      if (task.parent_task_id === parentId) {
        descendants.push(task.id);
        findDescendants(task.id); // Recursively find children
      }
    });
  };
  
  findDescendants(taskId);
  return descendants;
}

/**
 * Gets the root parent task for any task in the hierarchy
 * @param taskId - The task ID to find the root for
 * @param tasks - All tasks
 * @returns The root parent task or null if not found
 */
export function getRootParent(taskId: string, tasks: Task[]): Task | null {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  let currentTask = taskMap.get(taskId);
  
  if (!currentTask) return null;
  
  while (currentTask.parent_task_id) {
    const parent = taskMap.get(currentTask.parent_task_id);
    if (!parent) break;
    currentTask = parent;
  }
  
  return currentTask;
}

/**
 * Checks if a task can be a parent for another task (prevents circular references)
 * @param taskId - The task that would become a child
 * @param potentialParentId - The task that would become a parent
 * @param tasks - All tasks
 * @returns true if the relationship is valid, false if it would create a circular reference
 */
export function canBeParent(
  taskId: string, 
  potentialParentId: string, 
  tasks: Task[]
): boolean {
  // A task cannot be its own parent
  if (taskId === potentialParentId) return false;
  
  // Check if potentialParentId is a descendant of taskId
  const descendants = getDescendantIds(taskId, tasks);
  return !descendants.includes(potentialParentId);
}

/**
 * Gets available tasks that can be parents for a given task
 * @param taskId - The task that needs a parent (or null for new tasks)
 * @param tasks - All tasks
 * @returns Array of tasks that can be valid parents
 */
export function getAvailableParents(
  taskId: string | null, 
  tasks: Task[]
): Task[] {
  if (!taskId) {
    // New task can have any existing task as parent
    return tasks;
  }
  
  return tasks.filter(task => 
    task.id !== taskId && canBeParent(taskId, task.id, tasks)
  );
}