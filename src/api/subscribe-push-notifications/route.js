async function handler({ subscription, preferences = {} }) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return { error: "Valid push subscription is required" };
  }

  const { endpoint, keys } = subscription;

  if (!keys.p256dh || !keys.auth) {
    return { error: "Subscription keys (p256dh and auth) are required" };
  }

  try {
    const existingSubscription = await sql`
      SELECT id FROM push_subscriptions
      WHERE user_id = ${session.user.id} AND endpoint = ${endpoint}
    `;

    if (existingSubscription.length > 0) {
      const updated = await sql`
        UPDATE push_subscriptions
        SET 
          p256dh_key = ${keys.p256dh},
          auth_key = ${keys.auth},
          updated_at = now()
        WHERE user_id = ${session.user.id} AND endpoint = ${endpoint}
        RETURNING id, endpoint, created_at, updated_at
      `;

      await sql`
        UPDATE user_profiles
        SET 
          notification_settings = notification_settings || ${JSON.stringify(
            preferences
          )},
          updated_at = now()
        WHERE user_id = ${session.user.id}
      `;

      return {
        success: true,
        action: "updated",
        subscription: {
          id: updated[0].id,
          endpoint: updated[0].endpoint,
          created_at: updated[0].created_at,
          updated_at: updated[0].updated_at,
        },
        preferences: preferences,
      };
    } else {
      const newSubscription = await sql`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key)
        VALUES (${session.user.id}, ${endpoint}, ${keys.p256dh}, ${keys.auth})
        RETURNING id, endpoint, created_at, updated_at
      `;

      if (Object.keys(preferences).length > 0) {
        await sql`
          UPDATE user_profiles
          SET 
            notification_settings = notification_settings || ${JSON.stringify(
              preferences
            )},
            updated_at = now()
          WHERE user_id = ${session.user.id}
        `;
      }

      return {
        success: true,
        action: "created",
        subscription: {
          id: newSubscription[0].id,
          endpoint: newSubscription[0].endpoint,
          created_at: newSubscription[0].created_at,
          updated_at: newSubscription[0].updated_at,
        },
        preferences: preferences,
      };
    }
  } catch (error) {
    console.error("Error subscribing to push notifications:", error);
    return { error: "Failed to subscribe to push notifications" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}