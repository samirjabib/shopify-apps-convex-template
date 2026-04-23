// app/lib/session-storage.server.ts
import { Session } from "@shopify/shopify-app-react-router/server";
import type { ConvexHttpClient } from "convex/browser";
import { internal } from "../../convex/_generated/api";

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

export class ConvexSessionStorage implements SessionStorage {
  constructor(private client: ConvexHttpClient) {}

  async storeSession(session: Session): Promise<boolean> {
    // @ts-expect-error ConvexHttpClient types don't accept internal FunctionReferences
    await this.client.mutation(internal.sessions.storeInternal, {
      session: serialize(session),
    });
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const row = await this.client.query(
      // @ts-expect-error ConvexHttpClient types don't accept internal FunctionReferences
      internal.sessions.loadBySessionIdInternal,
      { sessionId: id },
    );
    return row ? deserialize(row) : undefined;
  }

  async deleteSession(id: string): Promise<boolean> {
    // @ts-expect-error ConvexHttpClient types don't accept internal FunctionReferences
    await this.client.mutation(internal.sessions.deleteBySessionIdInternal, {
      sessionId: id,
    });
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    // @ts-expect-error ConvexHttpClient types don't accept internal FunctionReferences
    await this.client.mutation(internal.sessions.deleteManyInternal, {
      sessionIds: ids,
    });
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const rows = await this.client.query(
      // @ts-expect-error ConvexHttpClient types don't accept internal FunctionReferences
      internal.sessions.findByShopInternal,
      { shop },
    );
    return rows.map(deserialize);
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

// biome-ignore lint/suspicious/noExplicitAny: Convex row type not importable here
function deserialize(row: any): Session {
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
