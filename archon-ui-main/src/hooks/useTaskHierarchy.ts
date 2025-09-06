import { useMemo } from 'react';

interface Task {
  id: string;
  parent_task_id?: string;
  [key: string]: any;
}

/**
 * Custom hook to compute task hierarchy information
 * @param tasks - Array of tasks
 * @returns Object with hierarchy data
 */
export function useTaskHierarchy(tasks: Task[]) {
  return useMemo(() => {
    // Create a map of task IDs to their children
    const childrenMap = new Map<string, string[]>();
    const parentMap = new Map<string, string>();
    
    tasks.forEach(task => {
      if (task.parent_task_id) {
        parentMap.set(task.id, task.parent_task_id);
        
        const siblings = childrenMap.get(task.parent_task_id) || [];
        siblings.push(task.id);
        childrenMap.set(task.parent_task_id, siblings);
      }
    });
    
    // Count total descendants (recursive)
    const getDescendantCount = (taskId: string): number => {
      const children = childrenMap.get(taskId) || [];
      let count = children.length;
      
      children.forEach(childId => {
        count += getDescendantCount(childId);
      });
      
      return count;
    };
    
    // Get all ancestor IDs for a task
    const getAncestors = (taskId: string): string[] => {
      const ancestors: string[] = [];
      let currentId = parentMap.get(taskId);
      
      while (currentId) {
        ancestors.push(currentId);
        currentId = parentMap.get(currentId);
      }
      
      return ancestors;
    };
    
    // Check if a task is a root (no parent)
    const isRoot = (taskId: string): boolean => {
      return !parentMap.has(taskId);
    };
    
    // Check if a task is a leaf (no children)
    const isLeaf = (taskId: string): boolean => {
      return !childrenMap.has(taskId);
    };
    
    // Get depth level (0 for root, 1 for direct children, etc.)
    const getDepth = (taskId: string): number => {
      return getAncestors(taskId).length;
    };
    
    return {
      childrenMap,
      parentMap,
      getDescendantCount,
      getAncestors,
      isRoot,
      isLeaf,
      getDepth,
      hasChildren: (taskId: string) => childrenMap.has(taskId),
      getChildren: (taskId: string) => childrenMap.get(taskId) || [],
      getParent: (taskId: string) => parentMap.get(taskId),
      rootTasks: tasks.filter(task => !task.parent_task_id),
      leafTasks: tasks.filter(task => !childrenMap.has(task.id))
    };
  }, [tasks]);
}