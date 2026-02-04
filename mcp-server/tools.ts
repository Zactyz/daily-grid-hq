/**
 * MCP Tool definitions for Daily Grid HQ kanban board
 */

import { KanbanApiClient } from './api-client.js';

export function defineTools(client: KanbanApiClient) {
  return [
    {
      name: 'list_cards',
      description: 'List all kanban cards, optionally filtered by status or epic. Returns cards with epic relationships (isEpic, epicId).',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['backlog', 'doing', 'blocked', 'done'],
            description: 'Filter cards by status (optional)',
          },
          includeArchived: {
            type: 'boolean',
            description: 'Include archived cards in results (default: false)',
            default: false,
          },
          epicOnly: {
            type: 'boolean',
            description: 'If true, return only epic cards (default: false)',
            default: false,
          },
          epicId: {
            type: 'string',
            description: 'If provided, return only cards that belong to this epic',
          },
        },
      },
    },
    {
      name: 'create_card',
      description: 'Create a new kanban card. The card will be added to the backlog by default unless a status is specified.',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Card title (required)',
          },
          description: {
            type: 'string',
            description: 'Card description (optional)',
          },
          status: {
            type: 'string',
            enum: ['backlog', 'doing', 'blocked', 'done'],
            description: 'Initial status (default: backlog)',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'Priority level (optional)',
          },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of label strings (optional)',
          },
          dueDate: {
            type: 'string',
            format: 'date',
            description: 'Due date in ISO format (YYYY-MM-DD) (optional)',
          },
          isEpic: {
            type: 'boolean',
            description: 'If true, create this card as an epic (optional)',
          },
          epicId: {
            type: 'string',
            description: 'Optional parent epic id for this card',
          },
        },
        required: ['title'],
      },
    },
    {
      name: 'create_epic',
      description: 'Create a new epic card (isEpic = true).',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Epic title (required)',
          },
          description: {
            type: 'string',
            description: 'Epic description (optional)',
          },
          status: {
            type: 'string',
            enum: ['backlog', 'doing', 'blocked', 'done'],
            description: 'Initial status (default: backlog)',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'Priority level (optional)',
          },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of label strings (optional)',
          },
          dueDate: {
            type: 'string',
            format: 'date',
            description: 'Due date in ISO format (YYYY-MM-DD) (optional)',
          },
        },
        required: ['title'],
      },
    },
    {
      name: 'update_card',
      description: 'Update an existing kanban card. Only provide the fields you want to change.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Card ID (required)',
          },
          title: {
            type: 'string',
            description: 'New title (optional)',
          },
          description: {
            type: 'string',
            description: 'New description (optional)',
          },
          status: {
            type: 'string',
            enum: ['backlog', 'doing', 'blocked', 'done'],
            description: 'New status (optional)',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'New priority (optional, set to null to remove)',
          },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description: 'New labels array (optional)',
          },
          dueDate: {
            type: 'string',
            format: 'date',
            description: 'New due date in ISO format (YYYY-MM-DD) (optional, set to null to remove)',
          },
          isEpic: {
            type: 'boolean',
            description: 'Promote/demote a card to epic (optional)',
          },
          epicId: {
            type: 'string',
            description: 'Set or clear parent epic id (optional, set to null to remove)',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'move_card',
      description: 'Move a card to a different status column. This is a convenience method for updating just the status.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Card ID (required)',
          },
          status: {
            type: 'string',
            enum: ['backlog', 'doing', 'blocked', 'done'],
            description: 'Target status (required)',
          },
        },
        required: ['id', 'status'],
      },
    },
    {
      name: 'archive_card',
      description: 'Archive a kanban card (soft delete). Archived cards are hidden by default but can be restored.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Card ID (required)',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'list_epics',
      description: 'List all epic cards.',
      inputSchema: {
        type: 'object',
        properties: {
          includeArchived: {
            type: 'boolean',
            description: 'Include archived epics in results (default: false)',
            default: false,
          },
        },
      },
    },
    {
      name: 'list_epic_children',
      description: 'List all cards that belong to a specific epic.',
      inputSchema: {
        type: 'object',
        properties: {
          epicId: {
            type: 'string',
            description: 'Epic card id (required)',
          },
          includeArchived: {
            type: 'boolean',
            description: 'Include archived cards in results (default: false)',
            default: false,
          },
        },
        required: ['epicId'],
      },
    },
    {
      name: 'link_card_to_epic',
      description: 'Attach an existing card to a parent epic.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Card id (required)',
          },
          epicId: {
            type: 'string',
            description: 'Epic card id (required)',
          },
        },
        required: ['id', 'epicId'],
      },
    },
    {
      name: 'unlink_card_from_epic',
      description: 'Remove a card from its parent epic.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Card id (required)',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'get_board_summary',
      description: 'Get high-level statistics for the kanban board including card counts by status, overdue tasks, and priority distribution.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];
}

export async function handleToolCall(
  toolName: string,
  args: any,
  client: KanbanApiClient
): Promise<any> {
  try {
    switch (toolName) {
      case 'list_cards': {
        const cards = await client.listCards(args.status, args.includeArchived, {
          epicOnly: args.epicOnly,
          epicId: args.epicId,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  cards: cards.map(c => ({
                    id: c.id,
                    title: c.title,
                    status: c.status,
                    description: c.description,
                    priority: c.priority,
                    labels: c.labels,
                    dueDate: c.dueDate ? new Date(c.dueDate).toISOString().split('T')[0] : null,
                    overdue: c.dueDate && c.dueDate < Date.now(),
                    updatedAt: new Date(c.updatedAt).toISOString(),
                    isEpic: !!c.isEpic,
                    epicId: c.epicId || null,
                  })),
                  count: cards.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'create_card': {
        const result = await client.createCard({
          title: args.title,
          description: args.description,
          status: args.status,
          priority: args.priority,
          labels: args.labels,
          dueDate: args.dueDate,
          isEpic: args.isEpic,
          epicId: args.epicId,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Card created successfully with ID: ${result.id}`,
            },
          ],
        };
      }

      case 'create_epic': {
        const result = await client.createCard({
          title: args.title,
          description: args.description,
          status: args.status,
          priority: args.priority,
          labels: args.labels,
          dueDate: args.dueDate,
          isEpic: true,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Epic created successfully with ID: ${result.id}`,
            },
          ],
        };
      }

      case 'update_card': {
        await client.updateCard({
          id: args.id,
          title: args.title,
          description: args.description,
          status: args.status,
          priority: args.priority,
          labels: args.labels,
          dueDate: args.dueDate,
          isEpic: args.isEpic,
          epicId: args.epicId,
        });
        return {
          content: [
            {
              type: 'text',
              text: 'Card updated successfully',
            },
          ],
        };
      }

      case 'move_card': {
        await client.moveCard(args.id, args.status);
        return {
          content: [
            {
              type: 'text',
              text: `Card moved to ${args.status}`,
            },
          ],
        };
      }

      case 'archive_card': {
        await client.archiveCard(args.id);
        return {
          content: [
            {
              type: 'text',
              text: 'Card archived successfully',
            },
          ],
        };
      }

      case 'list_epics': {
        const cards = await client.listCards(undefined, args.includeArchived, { epicOnly: true });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  epics: cards.map(c => ({
                    id: c.id,
                    title: c.title,
                    status: c.status,
                    priority: c.priority,
                    labels: c.labels,
                    dueDate: c.dueDate ? new Date(c.dueDate).toISOString().split('T')[0] : null,
                    updatedAt: new Date(c.updatedAt).toISOString(),
                  })),
                  count: cards.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'list_epic_children': {
        const cards = await client.listCards(undefined, args.includeArchived, { epicId: args.epicId });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  epicId: args.epicId,
                  cards: cards.map(c => ({
                    id: c.id,
                    title: c.title,
                    status: c.status,
                    priority: c.priority,
                    labels: c.labels,
                    dueDate: c.dueDate ? new Date(c.dueDate).toISOString().split('T')[0] : null,
                    updatedAt: new Date(c.updatedAt).toISOString(),
                  })),
                  count: cards.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'link_card_to_epic': {
        await client.updateCard({ id: args.id, epicId: args.epicId });
        return {
          content: [
            {
              type: 'text',
              text: 'Card linked to epic successfully',
            },
          ],
        };
      }

      case 'unlink_card_from_epic': {
        await client.updateCard({ id: args.id, epicId: null });
        return {
          content: [
            {
              type: 'text',
              text: 'Card unlinked from epic successfully',
            },
          ],
        };
      }

      case 'get_board_summary': {
        const summary = await client.getBoardSummary();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
