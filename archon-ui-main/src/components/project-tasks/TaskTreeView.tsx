import React, { useState, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown, Plus, Edit, Trash2, Check, MoreVertical } from 'lucide-react';
import { buildTaskTree, flattenTaskTree, TaskNode } from '../../lib/task-tree-utils';
import { getAssigneeIcon, getAssigneeGlow, getOrderColor, getOrderGlow } from '../../lib/task-utils';
import { useToast } from '../../contexts/ToastContext';

// Use a local Task interface that matches what TasksTab expects
interface Task {
  id: string;
  parent_task_id?: string;
  title: string;
  description: string;
  status: 'backlog' | 'in-progress' | 'review' | 'complete';
  assignee: {
    name: string;
    avatar: string;
  };
  feature: string;
  featureColor: string;
  task_order: number;
}

interface TaskTreeViewProps {
  tasks: Task[];
  onTaskView: (task: Task) => void;
  onTaskComplete: (taskId: string) => void;
  onTaskDelete: (task: Task) => void;
  onTaskCreate?: (parentId?: string) => void;
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => Promise<void>;
}

export const TaskTreeView: React.FC<TaskTreeViewProps> = ({
  tasks,
  onTaskView,
  onTaskComplete,
  onTaskDelete,
  onTaskCreate,
  onTaskUpdate
}) => {
  const { showToast } = useToast();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Build the task tree structure
  const taskTree = useMemo(() => buildTaskTree(tasks), [tasks]);
  
  // Flatten the tree for display (considering expanded state)
  const displayTasks = useMemo(() => 
    flattenTaskTree(taskTree, expandedIds), 
    [taskTree, expandedIds]
  );

  // Toggle expand/collapse for a task
  const toggleExpand = useCallback((taskId: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  }, []);

  // Get status badge style
  const getStatusBadge = (status: string) => {
    const statusMap = {
      'backlog': { text: 'Backlog', class: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
      'in-progress': { text: 'In Progress', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
      'review': { text: 'Review', class: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
      'complete': { text: 'Complete', class: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
      // Also support database status format
      'todo': { text: 'Backlog', class: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
      'doing': { text: 'In Progress', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
      'done': { text: 'Complete', class: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' }
    };
    const config = statusMap[status as keyof typeof statusMap] || statusMap.backlog;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.class}`}>
        {config.text}
      </span>
    );
  };

  const renderTask = (task: TaskNode) => {
    const hasChildren = task.children && task.children.length > 0;
    const isExpanded = expandedIds.has(task.id);
    const depth = task.depth || 0;
    const indentStyle = { paddingLeft: `${depth * 24 + 8}px` };

    return (
      <tr
        key={task.id}
        className={`
          hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors
          ${selectedTaskId === task.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
          ${depth > 0 ? 'border-l-2 border-gray-200 dark:border-gray-700' : ''}
        `}
        onClick={() => setSelectedTaskId(task.id)}
      >
        {/* Expand/Collapse & Title */}
        <td className="py-3 px-4">
          <div className="flex items-center gap-2" style={indentStyle}>
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(task.id);
                }}
                className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
              </button>
            ) : (
              <div className="w-5" /> // Spacer for alignment
            )}
            
            <span className="font-medium text-gray-900 dark:text-gray-100 flex-1">
              {task.title}
              {hasChildren && (
                <span className="ml-2 text-xs text-gray-500">
                  ({task.children.length})
                </span>
              )}
            </span>
          </div>
        </td>

        {/* Status */}
        <td className="py-3 px-4">
          {getStatusBadge(task.status)}
        </td>

        {/* Assignee */}
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {getAssigneeIcon(typeof task.assignee === 'string' ? task.assignee : task.assignee.name)}
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {typeof task.assignee === 'string' ? task.assignee : task.assignee.name}
            </span>
          </div>
        </td>

        {/* Feature */}
        <td className="py-3 px-4">
          {task.feature && (
            <span 
              className="px-2 py-1 rounded-full text-xs font-medium"
              style={{ 
                backgroundColor: `${task.featureColor}20`,
                color: task.featureColor 
              }}
            >
              {task.feature}
            </span>
          )}
        </td>

        {/* Priority */}
        <td className="py-3 px-4">
          <div className="flex items-center gap-1">
            <span className={`font-semibold ${getOrderColor(task.task_order)}`}>
              {task.task_order}
            </span>
          </div>
        </td>

        {/* Actions */}
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {/* Create Subtask */}
            {depth < 3 && ( // Limit nesting depth
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTaskCreate?.(task.id);
                }}
                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                title="Create subtask"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            
            {/* Edit */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTaskView(task);
              }}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
              title="Edit task"
            >
              <Edit className="w-4 h-4" />
            </button>

            {/* Complete */}
            {task.status !== 'done' && task.status !== 'complete' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTaskComplete(task.id);
                }}
                className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                title="Mark complete"
              >
                <Check className="w-4 h-4" />
              </button>
            )}

            {/* Delete */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) {
                  if (confirm(`This will delete ${task.children.length} subtask(s). Continue?`)) {
                    onTaskDelete(task);
                  }
                } else {
                  onTaskDelete(task);
                }
              }}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              title="Delete task"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
              Task
            </th>
            <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
              Status
            </th>
            <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
              Assignee
            </th>
            <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
              Feature
            </th>
            <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
              Priority
            </th>
            <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {displayTasks.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-8 text-center text-gray-500 dark:text-gray-400">
                No tasks yet. Create your first task to get started.
              </td>
            </tr>
          ) : (
            displayTasks.map(renderTask)
          )}
        </tbody>
      </table>
    </div>
  );
};