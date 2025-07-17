async function handler({ messageId, emoji }) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!messageId || !emoji) {
    return { error: "Message ID and emoji are required" };
  }

  try {
    const messageCheck = await sql`
      SELECT m.id, m.chat_id
      FROM messages m
      JOIN chat_participants cp ON m.chat_id = cp.chat_id
      WHERE m.id = ${messageId} 
        AND cp.user_id = ${session.user.id}
        AND m.is_deleted = false
    `;

    if (messageCheck.length === 0) {
      return { error: "Message not found or access denied" };
    }

    const existingReaction = await sql`
      SELECT id FROM message_reactions
      WHERE message_id = ${messageId} 
        AND user_id = ${session.user.id} 
        AND emoji = ${emoji}
    `;

    if (existingReaction.length > 0) {
      await sql`
        DELETE FROM message_reactions
        WHERE message_id = ${messageId} 
          AND user_id = ${session.user.id} 
          AND emoji = ${emoji}
      `;

      const reactionCounts = await sql`
        SELECT emoji, COUNT(*) as count
        FROM message_reactions
        WHERE message_id = ${messageId}
        GROUP BY emoji
        ORDER BY count DESC
      `;

      return {
        action: "removed",
        messageId: parseInt(messageId),
        emoji: emoji,
        reactions: reactionCounts.map((r) => ({
          emoji: r.emoji,
          count: parseInt(r.count),
        })),
      };
    } else {
      await sql`
        INSERT INTO message_reactions (message_id, user_id, emoji)
        VALUES (${messageId}, ${session.user.id}, ${emoji})
      `;

      const reactionCounts = await sql`
        SELECT emoji, COUNT(*) as count
        FROM message_reactions
        WHERE message_id = ${messageId}
        GROUP BY emoji
        ORDER BY count DESC
      `;

      return {
        action: "added",
        messageId: parseInt(messageId),
        emoji: emoji,
        reactions: reactionCounts.map((r) => ({
          emoji: r.emoji,
          count: parseInt(r.count),
        })),
      };
    }
  } catch (error) {
    console.error("Error handling message reaction:", error);
    return { error: "Failed to handle message reaction" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}