import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, LayoutGrid, Plus, Wifi, WifiOff, List, GitBranch } from 'lucide-react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Toggle } from '../ui/Toggle';
import { projectService } from '../../services/projectService';

import { useTaskSocket } from '../../hooks/useTaskSocket';
import type { CreateTaskRequest, UpdateTaskRequest, DatabaseTaskStatus } from '../../types/project';
import { TaskTableView, Task } from './TaskTableView';
import { TaskBoardView } from './TaskBoardView';
import { TaskTreeView } from './TaskTreeView';
import { EditTaskModal } from './EditTaskModal';

// Assignee utilities - removed hardcoded options, now using dynamic assignees

// Mapping functions for status conversion
const mapUIStatusToDBStatus = (uiStatus: Task['status']): DatabaseTaskStatus => {
  switch (uiStatus) {
    case 'backlog': return 'todo';
    case 'in-progress': return 'doing';
    case 'review': return 'review'; // Map UI 'review' to database 'review'
    case 'complete': return 'done';
    default: return 'todo';
  }
};

const mapDBStatusToUIStatus = (dbStatus: DatabaseTaskStatus): Task['status'] => {
  switch (dbStatus) {
    case 'todo': return 'backlog';
    case 'doing': return 'in-progress';
    case 'review': return 'review'; // Map database 'review' to UI 'review'
    case 'done': return 'complete';
    default: return 'backlog';
  }
};

// Helper function to map database task format to UI task format
const mapDatabaseTaskToUITask = (dbTask: any): Task => {
  return {
    id: dbTask.id,
    parent_task_id: dbTask.parent_task_id, // Include parent_task_id
    title: dbTask.title,
    description: dbTask.description || '',
    status: mapDBStatusToUIStatus(dbTask.status),
    assignee: {
      name: dbTask.assignee || 'User',
      avatar: ''
    },
    feature: dbTask.feature || 'General',
    featureColor: '#3b82f6', // Default blue color
    task_order: dbTask.task_order || 0,
  } as any;
};

export const TasksTab = ({
  initialTasks,
  onTasksChange,
  projectId
}: {
  initialTasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
  projectId: string;
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'board' | 'tree'>('board');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectFeatures, setProjectFeatures] = useState<any[]>([]);
  const [isLoadingFeatures, setIsLoadingFeatures] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState<boolean>(false);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [parentTaskId, setParentTaskId] = useState<string | undefined>(undefined);
  
  // Initialize tasks
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // Load project features on component mount
  useEffect(() => {
    loadProjectFeatures();
  }, [projectId]);

  // Optimized socket handlers with conflict resolution
  const handleTaskUpdated = useCallback((message: any) => {
    const updatedTask = message.data || message;
    const mappedTask = mapDatabaseTaskToUITask(updatedTask);
    
    // Skip updates while modal is open for the same task to prevent conflicts
    if (isModalOpen && editingTask?.id === updatedTask.id) {
      console.log('[Socket] Skipping update for task being edited:', updatedTask.id);
      return;
    }
    
    setTasks(prev => {
      // Use server timestamp for conflict resolution
      const existingTask = prev.find(task => task.id === updatedTask.id);
      if (existingTask) {
        // Check if this is a more recent update
        const serverTimestamp = message.server_timestamp || Date.now();
        const lastUpdate = existingTask.lastUpdate || 0;
        
        if (serverTimestamp <= lastUpdate) {
          console.log('[Socket] Ignoring stale update for task:', updatedTask.id);
          return prev;
        }
      }
      
      const updated = prev.map(task => 
        task.id === updatedTask.id 
          ? { ...mappedTask, lastUpdate: message.server_timestamp || Date.now() }
          : task
      );
      
      // Notify parent after state settles
      setTimeout(() => onTasksChange(updated), 0);
      return updated;
    });
  }, [onTasksChange, isModalOpen, editingTask?.id]);

  const handleTaskCreated = useCallback((message: any) => {
    const newTask = message.data || message;
    console.log('🆕 Real-time task created:', newTask);
    const mappedTask = mapDatabaseTaskToUITask(newTask);
    
    setTasks(prev => {
      // Check if task already exists to prevent duplicates
      if (prev.some(task => task.id === newTask.id)) {
        console.log('Task already exists, skipping create');
        return prev;
      }
      
      // Check if there's a temporary task that matches this one (by title and status)
      // This handles the case where our optimistic update is confirmed by socket
      const tempTaskIndex = prev.findIndex(task => 
        task.id.startsWith('temp-') && 
        task.title === mappedTask.title && 
        task.status === mappedTask.status
      );
      
      if (tempTaskIndex !== -1) {
        console.log('Replacing temporary task with real task from socket');
        const updated = [...prev];
        updated[tempTaskIndex] = mappedTask;
        setTimeout(() => onTasksChange(updated), 0);
        return updated;
      }
      
      // Add as new task
      const updated = [...prev, mappedTask];
      setTimeout(() => onTasksChange(updated), 0);
      return updated;
    });
  }, [onTasksChange]);

  const handleTaskDeleted = useCallback((message: any) => {
    const deletedTask = message.data || message;
    console.log('🗑️ Real-time task deleted:', deletedTask);
    setTasks(prev => {
      const updated = prev.filter(task => task.id !== deletedTask.id);
      setTimeout(() => onTasksChange(updated), 0);
      return updated;
    });
  }, [onTasksChange]);

  const handleTaskArchived = useCallback((message: any) => {
    const archivedTask = message.data || message;
    console.log('📦 Real-time task archived:', archivedTask);
    setTasks(prev => {
      const updated = prev.filter(task => task.id !== archivedTask.id);
      setTimeout(() => onTasksChange(updated), 0);
      return updated;
    });
  }, [onTasksChange]);

  const handleTasksReordered = useCallback((message: any) => {
    const reorderData = message.data || message;
    console.log('🔄 Real-time tasks reordered:', reorderData);
    
    // Handle bulk task reordering from server
    if (reorderData.tasks && Array.isArray(reorderData.tasks)) {
      const uiTasks: Task[] = reorderData.tasks.map(mapDatabaseTaskToUITask);
      setTasks(uiTasks);
      setTimeout(() => onTasksChange(uiTasks), 0);
    }
  }, [onTasksChange]);

  const handleInitialTasks = useCallback((message: any) => {
    const initialWebSocketTasks = message.data || message;
    const uiTasks: Task[] = initialWebSocketTasks.map(mapDatabaseTaskToUITask);
    setTasks(uiTasks);
    onTasksChange(uiTasks);
  }, [onTasksChange]);

  // Simplified socket connection with better lifecycle management
  const { isConnected, connectionState } = useTaskSocket({
    projectId,
    onTaskCreated: handleTaskCreated,
    onTaskUpdated: handleTaskUpdated,
    onTaskDeleted: handleTaskDeleted,
    onTaskArchived: handleTaskArchived,
    onTasksReordered: handleTasksReordered,
    onInitialTasks: handleInitialTasks,
    onConnectionStateChange: (state) => {
      setIsWebSocketConnected(state === 'connected');
    }
  });

  // Update connection state when hook state changes
  useEffect(() => {
    setIsWebSocketConnected(isConnected);
  }, [isConnected]);

  const loadProjectFeatures = async () => {
    if (!projectId) return;
    
    setIsLoadingFeatures(true);
    try {
      const response = await projectService.getProjectFeatures(projectId);
      setProjectFeatures(response.features || []);
    } catch (error) {
      console.error('Failed to load project features:', error);
      setProjectFeatures([]);
    } finally {
      setIsLoadingFeatures(false);
    }
  };

  // Modal management functions
  const openEditModal = async (task: Task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
  };

  const saveTask = async (task: Task) => {
    setEditingTask(task);
    
    setIsSavingTask(true);
    
    // Save original state for rollback (only for new tasks)
    const originalTasks = task.id ? null : [...tasks];
    let tempId: string | null = null;
    
    try {
      let parentTaskId = task.id;
      
      if (task.id) {
        // Update existing task (no optimistic update needed, socket handles it)
        const updateData: UpdateTaskRequest = {
          title: task.title,
          description: task.description,
          status: mapUIStatusToDBStatus(task.status),
          assignee: task.assignee?.name || 'User',
          task_order: task.task_order,
          ...(task.feature && { feature: task.feature }),
          ...(task.featureColor && { featureColor: task.featureColor })
        };
        
        await projectService.updateTask(task.id, updateData);
      } else {
        // Create new task with optimistic update
        console.log('[TasksTab] Creating new task via modal with optimistic update');
        
        // Generate temporary ID for optimistic update
        tempId = `temp-${crypto.randomUUID()}`;
        
        // Create optimistic task with ALL required fields properly formatted
        const optimisticTask: Task = {
          id: tempId,
          title: task.title,
          description: task.description || '',
          status: task.status,
          assignee: {
            name: task.assignee?.name || 'User',
            avatar: ''  // Required field, can be empty
          },
          feature: task.feature || 'General',
          featureColor: task.featureColor || '#3b82f6',
          task_order: task.task_order,
          lastUpdate: Date.now()  // For conflict resolution
        } as Task;
        
        // Optimistic update: Add to UI immediately
        const optimisticTasks = [...tasks, optimisticTask];
        updateTasks(optimisticTasks);
        console.log('[TasksTab] Task added to UI optimistically with temp ID:', tempId);
        
        // Create task on backend
        const createData: CreateTaskRequest = {
          project_id: projectId,
          parent_task_id: (task as any).parent_task_id, // Include parent_task_id if present
          title: task.title,
          description: task.description,
          status: mapUIStatusToDBStatus(task.status),
          assignee: task.assignee?.name || 'User',
          task_order: task.task_order,
          ...(task.feature && { feature: task.feature }),
          ...(task.featureColor && { featureColor: task.featureColor })
        };
        
        const createdTask = await projectService.createTask(createData);
        parentTaskId = createdTask.id;
        console.log('[TasksTab] Task creation confirmed by backend with ID:', parentTaskId);
        
        // Replace temp task with real task from backend
        const finalTasks = tasks.map(t => 
          t.id === tempId ? mapDatabaseTaskToUITask(createdTask) : t
        );
        updateTasks(finalTasks);
      }
      
      closeModal();
    } catch (error) {
      console.error('Failed to save task:', error);
      
      // Rollback on error (only for new tasks)
      if (originalTasks && tempId) {
        console.log('[TasksTab] Rolling back task creation');
        updateTasks(originalTasks);
      }
      
      alert(`Failed to save task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSavingTask(false);
    }
  };

  // Update tasks helper
  const updateTasks = (newTasks: Task[]) => {
    setTasks(newTasks);
    onTasksChange(newTasks);
  };

  // Helper function to reorder tasks by status to ensure no gaps (1,2,3...)
  const reorderTasksByStatus = async (status: Task['status']) => {
    const tasksInStatus = tasks
      .filter(task => task.status === status)
      .sort((a, b) => a.task_order - b.task_order);
    
    const updatePromises = tasksInStatus.map((task, index) => 
      projectService.updateTask(task.id, { task_order: index + 1 })
    );
    
    await Promise.all(updatePromises);
  };

  // Helper function to get next available order number for a status
  const getNextOrderForStatus = (status: Task['status']): number => {
    const tasksInStatus = tasks.filter(task => 
      task.status === status
    );
    
    if (tasksInStatus.length === 0) return 1;
    
    const maxOrder = Math.max(...tasksInStatus.map(task => task.task_order));
    return maxOrder + 1;
  };

  // Simple debounce function
  const debounce = (func: Function, delay: number) => {
    let timeoutId: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  };

  // Improved debounced persistence with better coordination
  const debouncedPersistSingleTask = useMemo(
    () => debounce(async (task: Task) => {
      try {
        console.log('REORDER: Persisting position change for task:', task.title, 'new position:', task.task_order);
        
        // Update only the moved task with server timestamp for conflict resolution
        await projectService.updateTask(task.id, { 
          task_order: task.task_order,
          client_timestamp: Date.now()
        });
        console.log('REORDER: Single task position persisted successfully');
        
      } catch (error) {
        console.error('REORDER: Failed to persist task position:', error);
        // Don't reload tasks immediately - let socket handle recovery
        console.log('REORDER: Socket will handle state recovery');
      }
    }, 800), // Slightly reduced delay for better responsiveness
    [projectId]
  );

  // Optimized task reordering without optimistic update conflicts
  const handleTaskReorder = useCallback((taskId: string, targetIndex: number, status: Task['status']) => {
    console.log('REORDER: Moving task', taskId, 'to index', targetIndex, 'in status', status);
    
    // Get all tasks in the target status, sorted by current order
    const statusTasks = tasks
      .filter(task => task.status === status)
      .sort((a, b) => a.task_order - b.task_order);
    
    const otherTasks = tasks.filter(task => task.status !== status);
    
    // Find the moving task
    const movingTaskIndex = statusTasks.findIndex(task => task.id === taskId);
    if (movingTaskIndex === -1) {
      console.log('REORDER: Task not found in status');
      return;
    }
    
    // Prevent invalid moves
    if (targetIndex < 0 || targetIndex >= statusTasks.length) {
      console.log('REORDER: Invalid target index', targetIndex);
      return;
    }
    
    // Skip if moving to same position
    if (movingTaskIndex === targetIndex) {
      console.log('REORDER: Task already in target position');
      return;
    }
    
    const movingTask = statusTasks[movingTaskIndex];
    console.log('REORDER: Moving', movingTask.title, 'from', movingTaskIndex, 'to', targetIndex);
    
    // Calculate new position using improved algorithm
    let newPosition: number;
    
    if (targetIndex === 0) {
      // Moving to first position
      const firstTask = statusTasks[0];
      newPosition = firstTask.task_order / 2;
    } else if (targetIndex === statusTasks.length - 1) {
      // Moving to last position
      const lastTask = statusTasks[statusTasks.length - 1];
      newPosition = lastTask.task_order + 1024;
    } else {
      // Moving between two items
      let prevTask, nextTask;
      
      if (targetIndex > movingTaskIndex) {
        // Moving down
        prevTask = statusTasks[targetIndex];
        nextTask = statusTasks[targetIndex + 1];
      } else {
        // Moving up
        prevTask = statusTasks[targetIndex - 1];
        nextTask = statusTasks[targetIndex];
      }
      
      if (prevTask && nextTask) {
        newPosition = (prevTask.task_order + nextTask.task_order) / 2;
      } else if (prevTask) {
        newPosition = prevTask.task_order + 1024;
      } else if (nextTask) {
        newPosition = nextTask.task_order / 2;
      } else {
        newPosition = 1024; // Fallback
      }
    }
    
    console.log('REORDER: New position calculated:', newPosition);
    
    // Create updated task with new position and timestamp
    const updatedTask = {
      ...movingTask,
      task_order: newPosition,
      lastUpdate: Date.now() // Add timestamp for conflict resolution
    };
    
    // Immediate UI update without optimistic tracking interference
    const allUpdatedTasks = otherTasks.concat(
      statusTasks.map(task => task.id === taskId ? updatedTask : task)
    );
    updateTasks(allUpdatedTasks);
    
    // Persist to backend (single API call)
    debouncedPersistSingleTask(updatedTask);
  }, [tasks, updateTasks, debouncedPersistSingleTask]);

  // Task move function (for board view) with optimistic updates and rollback
  const moveTask = async (taskId: string, newStatus: Task['status']) => {
    console.log(`[TasksTab] Attempting to move task ${taskId} to new status: ${newStatus}`);
    
    const movingTask = tasks.find(task => task.id === taskId);
    if (!movingTask) {
      console.warn(`[TasksTab] Task ${taskId} not found for move operation.`);
      return;
    }
    
    const oldStatus = movingTask.status;
    const newOrder = getNextOrderForStatus(newStatus);
    
    // Save original state for rollback
    const originalTasks = [...tasks];
    const originalTask = { ...movingTask };
    
    console.log(`[TasksTab] Moving task ${movingTask.title} from ${oldStatus} to ${newStatus} with order ${newOrder}`);

    try {
      // Optimistic update: Update UI immediately
      const optimisticTask = {
        ...movingTask,
        status: newStatus,
        task_order: newOrder,
        lastUpdate: Date.now()
      };
      
      const optimisticTasks = tasks.map(task => 
        task.id === taskId ? optimisticTask : task
      );
      
      // Apply optimistic update to UI
      updateTasks(optimisticTasks);
      console.log(`[TasksTab] Applied optimistic update for task ${taskId}`);

      // Attempt server update
      await projectService.updateTask(taskId, {
        status: mapUIStatusToDBStatus(newStatus),
        task_order: newOrder,
        client_timestamp: Date.now()
      });
      
      console.log(`[TasksTab] Successfully updated task ${taskId} status in backend.`);
      
    } catch (error) {
      console.error(`[TasksTab] Failed to move task ${taskId}:`, error);
      
      // Rollback: Restore original state
      console.log(`[TasksTab] Rolling back optimistic update for task ${taskId}`);
      updateTasks(originalTasks);
      
      // User-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-[9999] transition-all duration-300';
      notification.innerHTML = `
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
          </svg>
          <div>
            <div class="font-medium">Failed to move task</div>
            <div class="text-sm opacity-90">${errorMessage}</div>
          </div>
        </div>
      `;
      
      document.body.appendChild(notification);
      
      // Auto-remove notification after 5 seconds
      setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }, 5000);
    }
  };

  // Task feature move function with optimistic updates and rollback
  const moveTaskFeature = async (taskId: string, newFeature: string) => {
    console.log(`[TasksTab] Attempting to move task ${taskId} to new feature: ${newFeature}`);
    
    const movingTask = tasks.find(task => task.id === taskId);
    if (!movingTask) {
      console.warn(`[TasksTab] Task ${taskId} not found for feature move operation.`);
      return;
    }
    
    const oldFeature = movingTask.feature;
    
    // Save original state for rollback
    const originalTasks = [...tasks];
    
    console.log(`[TasksTab] Moving task ${movingTask.title} from feature ${oldFeature} to ${newFeature}`);

    try {
      // Optimistic update: Update UI immediately
      const optimisticTask = {
        ...movingTask,
        feature: newFeature,
        lastUpdate: Date.now()
      };
      
      const optimisticTasks = tasks.map(task => 
        task.id === taskId ? optimisticTask : task
      );
      
      // Apply optimistic update to UI
      updateTasks(optimisticTasks);
      console.log(`[TasksTab] Applied optimistic update for task ${taskId} feature change`);

      // Attempt server update
      await projectService.updateTask(taskId, {
        feature: newFeature,
        client_timestamp: Date.now()
      });
      
      console.log(`[TasksTab] Successfully updated task ${taskId} feature in backend.`);
      
    } catch (error) {
      console.error(`[TasksTab] Failed to move task ${taskId} to feature ${newFeature}:`, error);
      
      // Rollback: Restore original state
      console.log(`[TasksTab] Rolling back optimistic feature update for task ${taskId}`);
      updateTasks(originalTasks);
      
      // User-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-[9999] transition-all duration-300';
      notification.innerHTML = `
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
          </svg>
          <div>
            <div class="font-medium">Failed to change task feature</div>
            <div class="text-sm opacity-90">${errorMessage}</div>
          </div>
        </div>
      `;
      
      document.body.appendChild(notification);
      
      // Auto-remove notification after 5 seconds
      setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }, 5000);
    }
  };

  const completeTask = (taskId: string) => {
    console.log(`[TasksTab] Calling completeTask for ${taskId}`);
    moveTask(taskId, 'complete');
  };

  const deleteTask = async (task: Task) => {
    console.log(`[TasksTab] Attempting to delete task ${task.id}: ${task.title}`);
    
    // Save original state for rollback
    const originalTasks = [...tasks];
    
    try {
      // Optimistic update: Remove from UI immediately
      const optimisticTasks = tasks.filter(t => t.id !== task.id);
      updateTasks(optimisticTasks);
      console.log(`[TasksTab] Task ${task.id} removed from UI optimistically`);
      
      // Delete the task - backend will emit socket event for other clients
      await projectService.deleteTask(task.id);
      console.log(`[TasksTab] Task ${task.id} deletion confirmed by backend`);
      
      // Socket event will also arrive, but our UI is already updated
      // The socket handler will detect the task is already removed and skip update
      
    } catch (error) {
      console.error('Failed to delete task:', error);
      
      // Rollback on error: Restore original state
      console.log(`[TasksTab] Rolling back deletion of task ${task.id}`);
      updateTasks(originalTasks);
      
      // Note: The toast notification for deletion error is handled by TaskBoardView and TaskTableView
      throw error; // Re-throw to let the calling component handle error notification
    }
  };

  // Inline task creation function
  const createTaskInline = async (newTask: Omit<Task, 'id'>) => {
    console.log('[TasksTab] Creating new task with optimistic update');
    
    // Generate temporary ID for optimistic update
    const tempId = `temp-${crypto.randomUUID()}`;
    
    // Auto-assign next order number if not provided
    const nextOrder = newTask.task_order || getNextOrderForStatus(newTask.status);
    
    // Create optimistic task with ALL required fields properly formatted
    const optimisticTask: Task = {
      id: tempId,
      title: newTask.title,
      description: newTask.description || '',
      status: newTask.status,
      assignee: {
        name: newTask.assignee?.name || 'User',
        avatar: ''  // Required field, can be empty
      },
      feature: newTask.feature || 'General',
      featureColor: newTask.featureColor || '#3b82f6',
      task_order: nextOrder,
      lastUpdate: Date.now()  // For conflict resolution
    } as Task;
    
    // Save original state for rollback
    const originalTasks = [...tasks];
    
    try {
      // Optimistic update: Add to UI immediately
      const optimisticTasks = [...tasks, optimisticTask];
      updateTasks(optimisticTasks);
      console.log('[TasksTab] Task added to UI optimistically with temp ID:', tempId);
      
      const createData: CreateTaskRequest = {
        project_id: projectId,
        title: newTask.title,
        description: newTask.description,
        status: mapUIStatusToDBStatus(newTask.status),
        assignee: newTask.assignee?.name || 'User',
        task_order: nextOrder,
        ...(newTask.feature && { feature: newTask.feature }),
        ...(newTask.featureColor && { featureColor: newTask.featureColor })
      };
      
      const createdTask = await projectService.createTask(createData);
      console.log('[TasksTab] Task creation confirmed by backend with ID:', createdTask.id);
      
      // Replace temp task with real task from backend
      const finalTasks = tasks.map(t => 
        t.id === tempId ? mapDatabaseTaskToUITask(createdTask) : t
      );
      updateTasks(finalTasks);
      
    } catch (error) {
      console.error('Failed to create task:', error);
      
      // Rollback on error: Restore original state
      console.log('[TasksTab] Rolling back task creation');
      updateTasks(originalTasks);
      
      throw error;
    }
  };

  // Inline task update function
  const updateTaskInline = async (taskId: string, updates: Partial<Task>) => {
    console.log(`[TasksTab] Inline update for task ${taskId} with updates:`, updates);
    try {
      const updateData: Partial<UpdateTaskRequest> = {
        client_timestamp: Date.now()
      };
      
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.status !== undefined) {
        console.log(`[TasksTab] Mapping UI status ${updates.status} to DB status.`);
        updateData.status = mapUIStatusToDBStatus(updates.status);
        console.log(`[TasksTab] Mapped status for ${taskId}: ${updates.status} -> ${updateData.status}`);
      }
      if (updates.assignee !== undefined) updateData.assignee = updates.assignee.name;
      if (updates.task_order !== undefined) updateData.task_order = updates.task_order;
      if (updates.feature !== undefined) updateData.feature = updates.feature;
      if (updates.featureColor !== undefined) updateData.featureColor = updates.featureColor;
      
      console.log(`[TasksTab] Sending update request for task ${taskId} to projectService:`, updateData);
      await projectService.updateTask(taskId, updateData);
      console.log(`[TasksTab] projectService.updateTask successful for ${taskId}.`);
      
      // Don't update local state optimistically - let socket handle it
      console.log(`[TasksTab] Waiting for socket update for task ${taskId}.`);
      
    } catch (error) {
      console.error(`[TasksTab] Failed to update task ${taskId} inline:`, error);
      alert(`Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  };

  // Get unique assignees from all tasks for dynamic dropdown
  const getAvailableAssignees = useCallback((): string[] => {
    const assignees = new Set<string>();
    
    // Add assignees from all existing tasks
    tasks.forEach(task => {
      if (task.assignee?.name) {
        assignees.add(task.assignee.name);
      }
    });
    
    // Ensure backwards compatibility with default assignees
    const defaultAssignees = ['User', 'Archon', 'AI IDE Agent'];
    defaultAssignees.forEach(assignee => assignees.add(assignee));
    
    // Return sorted array for consistent order
    return Array.from(assignees).sort();
  }, [tasks]);

  // Get tasks for priority selection with descriptive labels
  const getTasksForPrioritySelection = (status: Task['status']): Array<{value: number, label: string}> => {
    const tasksInStatus = tasks
      .filter(task => task.status === status && task.id !== editingTask?.id) // Exclude current task if editing
      .sort((a, b) => a.task_order - b.task_order);
    
    const options: Array<{value: number, label: string}> = [];
    
    if (tasksInStatus.length === 0) {
      // No tasks in this status
      options.push({ value: 1, label: "1 - First task in this status" });
    } else {
      // Add option to be first
      options.push({ 
        value: 1, 
        label: `1 - Before "${tasksInStatus[0].title.substring(0, 30)}${tasksInStatus[0].title.length > 30 ? '...' : ''}"` 
      });
      
      // Add options between existing tasks
      for (let i = 0; i < tasksInStatus.length - 1; i++) {
        const currentTask = tasksInStatus[i];
        const nextTask = tasksInStatus[i + 1];
        options.push({ 
          value: i + 2, 
          label: `${i + 2} - After "${currentTask.title.substring(0, 20)}${currentTask.title.length > 20 ? '...' : ''}", Before "${nextTask.title.substring(0, 20)}${nextTask.title.length > 20 ? '...' : ''}"` 
        });
      }
      
      // Add option to be last
      const lastTask = tasksInStatus[tasksInStatus.length - 1];
      options.push({ 
        value: tasksInStatus.length + 1, 
        label: `${tasksInStatus.length + 1} - After "${lastTask.title.substring(0, 30)}${lastTask.title.length > 30 ? '...' : ''}"` 
      });
    }
    
    return options;
  };

  // Memoized version of getTasksForPrioritySelection to prevent recalculation on every render
  const memoizedGetTasksForPrioritySelection = useMemo(
    () => getTasksForPrioritySelection,
    [tasks, editingTask?.id]
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="min-h-[70vh] relative">
        {/* Main content - Table, Board, or Tree view */}
        <div className="relative h-[calc(100vh-220px)] overflow-auto bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
          {viewMode === 'table' ? (
            <TaskTableView
              tasks={tasks}
              onTaskView={openEditModal}
              onTaskComplete={completeTask}
              onTaskDelete={deleteTask}
              onTaskReorder={handleTaskReorder}
              onTaskCreate={createTaskInline}
              onTaskUpdate={updateTaskInline}
            />
          ) : viewMode === 'tree' ? (
            <TaskTreeView
              tasks={tasks}
              onTaskView={openEditModal}
              onTaskComplete={completeTask}
              onTaskDelete={deleteTask}
              onTaskCreate={(parentId) => {
                setParentTaskId(parentId);
                const defaultOrder = getTasksForPrioritySelection('backlog')[0]?.value || 1;
                setEditingTask({
                  id: '',
                  title: '',
                  description: '',
                  status: 'backlog',
                  assignee: { name: 'AI IDE Agent', avatar: '' },
                  feature: '',
                  featureColor: '#3b82f6',
                  task_order: defaultOrder,
                  parent_task_id: parentId
                } as any);
                setIsModalOpen(true);
              }}
              onTaskUpdate={updateTaskInline}
            />
          ) : (
            <TaskBoardView
              tasks={tasks}
              onTaskView={openEditModal}
              onTaskComplete={completeTask}
              onTaskDelete={deleteTask}
              onTaskMove={moveTask}
              onTaskFeatureMove={moveTaskFeature}
              onTaskReorder={handleTaskReorder}
            />
          )}
        </div>

        {/* Fixed View Controls */}
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="flex items-center gap-4">
            {/* WebSocket Status Indicator */}
            <div className="flex items-center gap-2 px-3 py-2 bg-white/80 dark:bg-black/90 border border-gray-200 dark:border-gray-800 rounded-lg shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(0,0,0,0.5)] backdrop-blur-md pointer-events-auto">
              {isWebSocketConnected ? (
                <>
                  <Wifi className="w-4 h-4 text-green-500" />
                  <span className="text-xs text-green-600 dark:text-green-400">Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-red-600 dark:text-red-400">Offline</span>
                </>
              )}
            </div>
            
            {/* Add Task Button with Luminous Style */}
            <button 
              onClick={() => {
                const defaultOrder = getTasksForPrioritySelection('backlog')[0]?.value || 1;
                setEditingTask({
                  id: '',
                  title: '',
                  description: '',
                  status: 'backlog',
                  assignee: { name: 'AI IDE Agent', avatar: '' },
                  feature: '',
                  featureColor: '#3b82f6',
                  task_order: defaultOrder
                });
                setIsModalOpen(true);
              }}
              className="relative px-5 py-2.5 flex items-center gap-2 bg-white/80 dark:bg-black/90 border border-gray-200 dark:border-gray-800 rounded-lg shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(0,0,0,0.5)] backdrop-blur-md pointer-events-auto text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-all duration-300"
            >
              <Plus className="w-4 h-4 mr-1" />
              <span>Add Task</span>
              <span className="absolute bottom-0 left-[0%] right-[0%] w-[95%] mx-auto h-[2px] bg-cyan-500 shadow-[0_0_10px_2px_rgba(34,211,238,0.4)] dark:shadow-[0_0_20px_5px_rgba(34,211,238,0.7)]"></span>
            </button>
          
            {/* View Toggle Controls */}
            <div className="flex items-center bg-white/80 dark:bg-black/90 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(0,0,0,0.5)] backdrop-blur-md pointer-events-auto">
              <button 
                onClick={() => setViewMode('table')} 
                className={`px-5 py-2.5 flex items-center gap-2 relative transition-all duration-300 ${viewMode === 'table' ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300'}`}
              >
                <Table className="w-4 h-4" />
                <span>Table</span>
                {viewMode === 'table' && <span className="absolute bottom-0 left-[15%] right-[15%] w-[70%] mx-auto h-[2px] bg-cyan-500 shadow-[0_0_10px_2px_rgba(34,211,238,0.4)] dark:shadow-[0_0_20px_5px_rgba(34,211,238,0.7)]"></span>}
              </button>
              <button 
                onClick={() => setViewMode('tree')} 
                className={`px-5 py-2.5 flex items-center gap-2 relative transition-all duration-300 ${viewMode === 'tree' ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300'}`}
              >
                <GitBranch className="w-4 h-4" />
                <span>Tree</span>
                {viewMode === 'tree' && <span className="absolute bottom-0 left-[15%] right-[15%] w-[70%] mx-auto h-[2px] bg-green-500 shadow-[0_0_10px_2px_rgba(34,197,94,0.4)] dark:shadow-[0_0_20px_5px_rgba(34,197,94,0.7)]"></span>}
              </button>
              <button 
                onClick={() => setViewMode('board')} 
                className={`px-5 py-2.5 flex items-center gap-2 relative transition-all duration-300 ${viewMode === 'board' ? 'text-purple-600 dark:text-purple-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300'}`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span>Board</span>
                {viewMode === 'board' && <span className="absolute bottom-0 left-[15%] right-[15%] w-[70%] mx-auto h-[2px] bg-purple-500 shadow-[0_0_10px_2px_rgba(168,85,247,0.4)] dark:shadow-[0_0_20px_5px_rgba(168,85,247,0.7)]"></span>}
              </button>
            </div>
          </div>
        </div>

        {/* Edit Task Modal */}
        <EditTaskModal
          isModalOpen={isModalOpen}
          editingTask={editingTask}
          projectFeatures={projectFeatures}
          isLoadingFeatures={isLoadingFeatures}
          isSavingTask={isSavingTask}
          onClose={closeModal}
          onSave={saveTask}
          getTasksForPrioritySelection={memoizedGetTasksForPrioritySelection}
          availableAssignees={getAvailableAssignees()}
        />
      </div>
    </DndProvider>
  );
};