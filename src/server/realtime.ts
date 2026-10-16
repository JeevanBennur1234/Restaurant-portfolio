import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { env } from "@/server/env";

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Single Supabase client at module level
let supabaseClient: SupabaseClient | null = null;

if (
  supabaseUrl &&
  supabaseKey &&
  !supabaseUrl.includes("placeholder") &&
  !supabaseKey.includes("placeholder")
) {
  supabaseClient = createClient(supabaseUrl, supabaseKey);
}

/**
 * Derives a private, authenticated channel name for a restaurant:
 * restaurant: + HMAC-SHA256(restaurantId, SESSION_SECRET).slice(0, 24)
 */
export function getRestaurantChannel(restaurantId: string): string {
  const hash = crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(restaurantId)
    .digest("hex")
    .slice(0, 24);
  return `restaurant:${hash}`;
}

/**
 * Unified server helper to broadcast events across DinePulse realtime channels.
 * Sends via REST broadcast (channel.httpSend) when available, otherwise subscribes once,
 * sends, and cleans up via removeChannel so channels are never leaked.
 */
export async function publishRealtimeEvent(
  channelName: string,
  event: string,
  payload: unknown
): Promise<void> {
  if (!supabaseClient) {
    if (env.NODE_ENV !== "production") {
      console.log(
        `[Realtime Mock Broadcast] Channel: ${channelName} | Event: ${event}`,
        payload
      );
    }
    return;
  }

  const channel = supabaseClient.channel(channelName);
  try {
    const channelAny = channel as unknown as {
      httpSend?: (event: string, payload: unknown) => Promise<unknown>;
    };

    if (typeof channelAny.httpSend === "function") {
      await channelAny.httpSend(event, payload ?? {});
    } else {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(); // Don't hang API handler if websocket connection is slow
          }
        }, 1500);

        channel.subscribe(async (status) => {
          if (settled) return;
          if (status === "SUBSCRIBED") {
            try {
              await channel.send({
                type: "broadcast",
                event,
                payload,
              });
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve();
              }
            } catch (err) {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(err);
              }
            }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              reject(new Error(`Channel subscribe failed with status: ${status}`));
            }
          }
        });
      });
    }
  } catch (error) {
    console.error(
      `[Realtime Publish Error] Channel: ${channelName} | Event: ${event}:`,
      (error as Error).message
    );
  } finally {
    try {
      await supabaseClient.removeChannel(channel);
    } catch {
      // Ignored if channel already cleared
    }
  }
}
