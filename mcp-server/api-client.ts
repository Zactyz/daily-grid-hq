/**
 * HTTP client for Daily Grid HQ kanban API
 */

export interface Card {
  id: string;
  title: string;
  status: 'backlog' | 'doing' | 'blocked' | 'done';
  sort: number;
  createdAt: number;
  updatedAt: number;
  description?: string | null;
  labels?: string[];
  dueDate?: number | null;
  archived?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'urgent' | null;
  isEpic?: boolean;
  epicId?: string | null;
}

export interface CreateCardInput {
  title: string;
  description?: string;
  status?: 'backlog' | 'doing' | 'blocked' | 'done';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  labels?: string[];
  dueDate?: string; // ISO date string
  isEpic?: boolean;
  epicId?: string | null;
}

export interface UpdateCardInput {
  id: string;
  title?: string;
  description?: string;
  status?: 'backlog' | 'doing' | 'blocked' | 'done';
  priority?: 'low' | 'medium' | 'high' | 'urgent' | null;
  labels?: string[];
  dueDate?: string | null; // ISO date string or null
  isEpic?: boolean;
  epicId?: string | null;
}

export interface ApiResponse<T> {
  ok: boolean;
  error?: string;
  reason?: string;
  [key: string]: any;
}

export class KanbanApiClient {
  private baseUrl: string;
  private apiToken?: string;

  constructor(baseUrl: string, apiToken?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiToken = apiToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(options.headers as any);
    headers.set('Content-Type', 'application/json');

    if (this.apiToken) {
      headers.set('Authorization', `Bearer ${this.apiToken}`);
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error((data && data.error) || `HTTP ${response.status}: ${response.statusText}`);
    }

    return data as T;
  }

  async listCards(
    status?: string,
    includeArchived = false,
    options: { epicOnly?: boolean; epicId?: string } = {}
  ): Promise<Card[]> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (includeArchived) params.set('archived', 'true');
    if (options.epicOnly) params.set('epic', 'true');
    if (options.epicId) params.set('epicId', options.epicId);
    
    const query = params.toString();
    const path = `/api/cards${query ? `?${query}` : ''}`;
    
    const response = await this.request<{ ok: boolean; cards: Card[] }>(path);
    return response.cards || [];
  }

  async getCard(id: string): Promise<Card | null> {
    try {
      const cards = await this.listCards();
      return cards.find(c => c.id === id) || null;
    } catch (e) {
      return null;
    }
  }

  async createCard(input: CreateCardInput): Promise<{ ok: boolean; id: string }> {
    const body: any = {
      title: input.title,
    };

    if (input.description) body.description = input.description;
    if (input.status) body.status = input.status;
    if (input.priority) body.priority = input.priority;
    if (input.labels) body.labels = input.labels;
    if (input.dueDate) body.dueDate = input.dueDate;
    if (input.isEpic !== undefined) body.isEpic = input.isEpic;
    if (input.epicId !== undefined) body.epicId = input.epicId;

    return this.request(`/api/cards`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateCard(input: UpdateCardInput): Promise<{ ok: boolean }> {
    const body: any = {};

    if (input.title !== undefined) body.title = input.title;
    if (input.description !== undefined) body.description = input.description;
    if (input.status !== undefined) body.status = input.status;
    if (input.priority !== undefined) body.priority = input.priority;
    if (input.labels !== undefined) body.labels = input.labels;
    if (input.dueDate !== undefined) {
      body.dueDate = input.dueDate ? new Date(input.dueDate).getTime() : null;
    }
    if (input.isEpic !== undefined) body.isEpic = input.isEpic;
    if (input.epicId !== undefined) body.epicId = input.epicId;

    return this.request(`/api/cards/${input.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async moveCard(id: string, status: 'backlog' | 'doing' | 'blocked' | 'done'): Promise<{ ok: boolean }> {
    return this.updateCard({ id, status });
  }

  async archiveCard(id: string): Promise<{ ok: boolean }> {
    return this.request(`/api/cards/${id}/archive`, {
      method: 'POST',
    });
  }

  async getBoardSummary(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    overdue: number;
    byPriority: Record<string, number>;
    epics: {
      total: number;
      withChildren: number;
      orphanChildren: number;
    };
  }> {
    const cards = await this.listCards();
    
    const byStatus: Record<string, number> = {
      backlog: 0,
      doing: 0,
      blocked: 0,
      done: 0,
    };

    const byPriority: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      urgent: 0,
    };

    let overdue = 0;
    const now = Date.now();
    const epicIds = new Set(cards.filter(c => c.isEpic).map(c => c.id));
    let epicWithChildren = 0;
    let orphanChildren = 0;
    const childCounts: Record<string, number> = {};

    for (const card of cards) {
      if (card.archived) continue;
      
      byStatus[card.status] = (byStatus[card.status] || 0) + 1;
      
      if (card.priority) {
        byPriority[card.priority] = (byPriority[card.priority] || 0) + 1;
      }

      if (card.dueDate && card.dueDate < now) {
        overdue++;
      }

      if (card.epicId) {
        childCounts[card.epicId] = (childCounts[card.epicId] || 0) + 1;
        if (!epicIds.has(card.epicId)) {
          orphanChildren++;
        }
      }
    }

    epicIds.forEach((id) => {
      if (childCounts[id]) epicWithChildren++;
    });

    return {
      total: cards.filter(c => !c.archived).length,
      byStatus,
      overdue,
      byPriority,
      epics: {
        total: epicIds.size,
        withChildren: epicWithChildren,
        orphanChildren,
      },
    };
  }
}
