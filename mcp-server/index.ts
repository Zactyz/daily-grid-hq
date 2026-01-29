#!/usr/bin/env node

/**
 * Daily Grid HQ MCP Server
 * 
 * This MCP server provides tools for managing the Daily Grid HQ kanban board.
 * It can be used with Moltbot, Claude Desktop, Cursor, or any MCP-compatible client.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { KanbanApiClient } from './api-client.js';
import { defineTools, handleToolCall } from './tools.js';

const KANBAN_API_URL = process.env.KANBAN_API_URL || 'http://localhost:8796';
const KANBAN_API_TOKEN = process.env.KANBAN_API_TOKEN;

if (!KANBAN_API_URL) {
  console.error('Error: KANBAN_API_URL environment variable is required');
  process.exit(1);
}

const client = new KanbanApiClient(KANBAN_API_URL, KANBAN_API_TOKEN);
const tools = defineTools(client);

const server = new Server(
  {
    name: 'daily-grid-hq',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = tools.find(t => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return handleToolCall(name, args || {}, client);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('Daily Grid HQ MCP Server running on stdio');
  console.error(`Connected to kanban API: ${KANBAN_API_URL}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
