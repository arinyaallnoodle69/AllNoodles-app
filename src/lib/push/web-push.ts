import "server-only";

import webpush from "web-push";
import { getSiteUrl } from "@/lib/site-url";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getWebPushPrivateKey,
  getWebPushPublicKey,
  getWebPushSubject,
  hasWebPushConfig,
} from "@/lib/supabase/env";

type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

type StoredPushSubscriptionRow = PushSubscriptionRecord & {
  id: string;
  organization_id: string;
  user_id: string;
  is_active: boolean;
  platform: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};

type SavePushSubscriptionInput = PushSubscriptionRecord & {
  organizationId: string;
  userId: string;
  platform?: string | null;
  userAgent?: string | null;
};

type PushPayload = {
  title: string;
  body: string;
  badgeCount?: number;
  icon?: string;
  badge?: string;
  url?: string;
};

type PushTableClient = ReturnType<typeof getSupabaseAdmin> & {
  // push_subscriptions is added by a local migration and may not be in generated types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: "push_subscriptions") => any;
};

function pushTable(supabase: ReturnType<typeof getSupabaseAdmin>) {
  return (supabase as PushTableClient).from("push_subscriptions");
}

let webPushConfigured = false;

function ensureWebPushConfigured() {
  if (!hasWebPushConfig()) {
    return false;
  }

  if (!webPushConfigured) {
    webpush.setVapidDetails(
      getWebPushSubject(),
      getWebPushPublicKey(),
      getWebPushPrivateKey(),
    );
    webPushConfigured = true;
  }

  return true;
}

export function getPushSubscriptionPublicKey() {
  return hasWebPushConfig() ? getWebPushPublicKey() : "";
}

export async function savePushSubscription(input: SavePushSubscriptionInput) {
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();

  const { error } = await pushTable(supabase).upsert(
    {
      organization_id: input.organizationId,
      user_id: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      platform: input.platform ?? null,
      user_agent: input.userAgent ?? null,
      is_active: true,
      last_seen_at: now,
      updated_at: now,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    throw new Error(`Failed to save push subscription: ${error.message}`);
  }
}

export async function getUserPushSubscriptions(organizationId: string, userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await pushTable(supabase)
    .select("id, endpoint, p256dh, auth, is_active, organization_id, user_id, platform, user_agent, created_at, updated_at, last_seen_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to load push subscriptions: ${error.message}`);
  }

  return (data ?? []) as StoredPushSubscriptionRow[];
}

async function deactivatePushSubscriptionsByEndpoint(endpoints: string[]) {
  if (endpoints.length === 0) return;

  const supabase = getSupabaseAdmin();
  const { error } = await pushTable(supabase)
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .in("endpoint", endpoints);

  if (error) {
    console.warn("[push] Failed to deactivate subscriptions:", error.message);
  }
}

export async function deactivateUserPushSubscription(
  organizationId: string,
  userId: string,
  endpoint: string,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await pushTable(supabase)
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("endpoint", endpoint);

  if (error) {
    throw new Error(`Failed to deactivate push subscription: ${error.message}`);
  }
}

export async function sendNewOrderPushNotification({
  organizationId,
  customerName,
  orderNumber,
}: {
  organizationId: string;
  customerName: string;
  orderNumber: string;
}) {
  if (!ensureWebPushConfigured()) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await pushTable(supabase)
    .select("id, endpoint, p256dh, auth, is_active, organization_id, user_id, platform, user_agent, created_at, updated_at, last_seen_at")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (error) {
    console.warn("[push] Failed to load subscriptions:", error.message);
    return;
  }

  const subscriptions = (data ?? []) as StoredPushSubscriptionRow[];
  if (subscriptions.length === 0) {
    return;
  }

  const payload: PushPayload = {
    title: "มีออเดอร์ใหม่",
    body: `${customerName} - ${orderNumber}`,
    badgeCount: 1,
    icon: "/brand/192x192.png",
    badge: "/brand/192x192.png",
    url: `${getSiteUrl()}/orders/incoming`,
  };

  const invalidEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(payload),
          {
            TTL: 60 * 60,
            urgency: "high",
            topic: orderNumber.slice(0, 32),
          },
        );
      } catch (error) {
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : 0;

        console.warn("[push] Failed to send notification:", statusCode || error);

        if (statusCode === 400 || statusCode === 404 || statusCode === 410) {
          invalidEndpoints.push(subscription.endpoint);
        }
      }
    }),
  );

  if (invalidEndpoints.length > 0) {
    await deactivatePushSubscriptionsByEndpoint(invalidEndpoints);
  }
}

export async function sendNewCustomerInquiryPushNotification({
  organizationId,
  customerName,
  customerPhone,
}: {
  organizationId: string;
  customerName: string;
  customerPhone: string;
}) {
  if (!ensureWebPushConfigured()) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await pushTable(supabase)
    .select("id, endpoint, p256dh, auth, is_active, organization_id, user_id, platform, user_agent, created_at, updated_at, last_seen_at")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (error) {
    console.warn("[push] Failed to load subscriptions:", error.message);
    return;
  }

  const subscriptions = (data ?? []) as StoredPushSubscriptionRow[];
  if (subscriptions.length === 0) {
    return;
  }

  const dialNumber = customerPhone.replace(/\s+/g, "");

  const payload: PushPayload = {
    title: "🆕 ลูกค้าใหม่ขอสั่งสินค้า",
    body: `${customerName} · ${customerPhone} — แตะเพื่อโทรหาลูกค้า`,
    badgeCount: 1,
    icon: "/brand/192x192.png",
    badge: "/brand/192x192.png",
    url: `tel:${dialNumber}`,
  };

  const invalidEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(payload),
          {
            TTL: 60 * 60 * 24,
            urgency: "high",
            topic: "new-customer-inquiry",
          },
        );
      } catch (error) {
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : 0;

        console.warn("[push] Failed to send inquiry notification:", statusCode || error);

        if (statusCode === 400 || statusCode === 404 || statusCode === 410) {
          invalidEndpoints.push(subscription.endpoint);
        }
      }
    }),
  );

  if (invalidEndpoints.length > 0) {
    await deactivatePushSubscriptionsByEndpoint(invalidEndpoints);
  }
}
