// app/lib/session-storage.server.ts
import { Session } from "@shopify/shopify-app-react-router/server";
import { internal } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import type { AdminConvexClient } from "../convex.server";

/**
 * Minimal SessionStorage interface from @shopify/shopify-app-session-storage.
 * Defined inline to avoid depending on the nested package path.
 */
export interface SessionStorage {
  storeSession(session: Session): Promise<boolean>;
  loadSession(id: string): Promise<Session | undefined>;
  deleteSession(id: string): Promise<boolean>;
  deleteSessions(ids: string[]): Promise<boolean>;
  findSessionsByShop(shop: string): Promise<Session[]>;
}

// Network / 5xx failures propagate to Shopify's auth middleware so a brief
// Convex outage surfaces as an auth error instead of silently looping through
// re-OAuth. Swallowing with `return false` caused infinite OAuth loops.
function isTransient(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /fetch failed|network|ECONN|ETIMEDOUT|5\d\d/i.test(message) ||
    (err as { name?: string })?.name === "TypeError"
  );
}

function logAndRethrow(op: string, err: unknown): never {
  console.error(`ConvexSessionStorage.${op} failed`, {
    op,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  throw err;
}

export class ConvexSessionStorage implements SessionStorage {
  constructor(private client: AdminConvexClient) {}

  async storeSession(session: Session): Promise<boolean> {
    try {
      await this.client.mutation(internal.sessions.storeInternal, {
        session: serialize(session),
      });
      return true;
    } catch (err) {
      if (isTransient(err)) logAndRethrow("storeSession", err);
      console.error("ConvexSessionStorage.storeSession failed", err);
      return false;
    }
  }

  async loadSession(id: string): Promise<Session | undefined> {
    try {
      const row = await this.client.query<Doc<"sessions"> | null>(
        internal.sessions.loadBySessionIdInternal,
        { sessionId: id },
      );
      return row ? deserialize(row) : undefined;
    } catch (err) {
      if (isTransient(err)) logAndRethrow("loadSession", err);
      console.error("ConvexSessionStorage.loadSession failed", err);
      return undefined;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      await this.client.mutation(internal.sessions.deleteBySessionIdInternal, {
        sessionId: id,
      });
      return true;
    } catch (err) {
      if (isTransient(err)) logAndRethrow("deleteSession", err);
      console.error("ConvexSessionStorage.deleteSession failed", err);
      return false;
    }
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    try {
      await this.client.mutation(internal.sessions.deleteManyInternal, {
        sessionIds: ids,
      });
      return true;
    } catch (err) {
      if (isTransient(err)) logAndRethrow("deleteSessions", err);
      console.error("ConvexSessionStorage.deleteSessions failed", err);
      return false;
    }
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    try {
      const rows = await this.client.query<Doc<"sessions">[]>(
        internal.sessions.findByShopInternal,
        { shop },
      );
      return rows.map(deserialize);
    } catch (err) {
      if (isTransient(err)) logAndRethrow("findSessionsByShop", err);
      console.error("ConvexSessionStorage.findSessionsByShop failed", err);
      return [];
    }
  }
}

function serialize(s: Session) {
  return {
    sessionId: s.id,
    shop: s.shop,
    state: s.state,
    isOnline: s.isOnline,
    scope: s.scope ?? undefined,
    expires: s.expires ? s.expires.getTime() : undefined,
    accessToken: s.accessToken ?? "",
    userId: s.onlineAccessInfo?.associated_user?.id
      ? String(s.onlineAccessInfo.associated_user.id)
      : undefined,
    firstName: s.onlineAccessInfo?.associated_user?.first_name ?? undefined,
    lastName: s.onlineAccessInfo?.associated_user?.last_name ?? undefined,
    email: s.onlineAccessInfo?.associated_user?.email ?? undefined,
    accountOwner: s.onlineAccessInfo?.associated_user?.account_owner ?? false,
    locale: s.onlineAccessInfo?.associated_user?.locale ?? undefined,
    collaborator:
      s.onlineAccessInfo?.associated_user?.collaborator ?? undefined,
    emailVerified:
      s.onlineAccessInfo?.associated_user?.email_verified ?? undefined,
  };
}

function deserialize(row: Doc<"sessions">): Session {
  const s = new Session({
    id: row.sessionId,
    shop: row.shop,
    state: row.state,
    isOnline: row.isOnline,
  });
  s.scope = row.scope;
  s.expires = row.expires ? new Date(row.expires) : undefined;
  s.accessToken = row.accessToken;
  if (row.userId) {
    // OnlineAccessInfo uses snake_case fields (confirmed from @shopify/shopify-api types)
    s.onlineAccessInfo = {
      expires_in: 0,
      associated_user_scope: "",
      associated_user: {
        id: Number(row.userId),
        first_name: row.firstName ?? "",
        last_name: row.lastName ?? "",
        email: row.email ?? "",
        account_owner: row.accountOwner ?? false,
        locale: row.locale ?? "",
        collaborator: row.collaborator ?? false,
        email_verified: row.emailVerified ?? false,
      },
    };
  }
  return s;
}
