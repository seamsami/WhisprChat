async function handler({
  messageId,
  targetChatIds,
  withCaption = false,
  caption = "",
}) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (
    !messageId ||
    !targetChatIds ||
    !Array.isArray(targetChatIds) ||
    targetChatIds.length === 0
  ) {
    return { error: "Message ID and target chat IDs are required" };
  }

  try {
    const originalMessage = await sql`
      SELECT 
        m.id,
        m.chat_id,
        m.sender_id,
        m.message_type,
        m.content,
        m.media_url,
        m.media_type,
        m.file_name,
        m.file_size,
        m.is_deleted,
        m.forward_count,
        m.forwarded_from,
        COALESCE(up.display_name, au.name, au.email) as original_sender_name
      FROM messages m
      JOIN chat_participants cp ON m.chat_id = cp.chat_id
      JOIN auth_users au ON m.sender_id = au.id
      LEFT JOIN user_profiles up ON au.id = up.user_id
      WHERE m.id = ${messageId} 
        AND cp.user_id = ${session.user.id}
        AND m.is_deleted = false
    `;

    if (originalMessage.length === 0) {
      return { error: "Message not found or access denied" };
    }

    const message = originalMessage[0];

    const targetChatsAccess = await sql`
      SELECT DISTINCT chat_id
      FROM chat_participants
      WHERE chat_id = ANY(${targetChatIds}) 
        AND user_id = ${session.user.id}
    `;

    if (targetChatsAccess.length !== targetChatIds.length) {
      return { error: "Access denied to one or more target chats" };
    }

    const forwardedMessages = [];
    const forwardRecords = [];

    for (const targetChatId of targetChatIds) {
      let forwardContent = message.content;

      if (withCaption && caption.trim()) {
        forwardContent = caption.trim();
      }

      const newMessage = await sql`
        INSERT INTO messages (
          chat_id,
          sender_id,
          message_type,
          content,
          media_url,
          media_type,
          file_name,
          file_size,
          forwarded_from
        )
        VALUES (
          ${targetChatId},
          ${session.user.id},
          ${message.message_type},
          ${forwardContent},
          ${message.media_url},
          ${message.media_type},
          ${message.file_name},
          ${message.file_size},
          ${message.forwarded_from || message.id}
        )
        RETURNING *
      `;

      const messageWithSender = await sql`
        SELECT 
          m.*,
          COALESCE(up.display_name, au.name, au.email) as sender_name,
          up.profile_picture as sender_profile_picture
        FROM messages m
        JOIN auth_users au ON m.sender_id = au.id
        LEFT JOIN user_profiles up ON au.id = up.user_id
        WHERE m.id = ${newMessage[0].id}
      `;

      forwardedMessages.push({
        id: messageWithSender[0].id,
        chat_id: messageWithSender[0].chat_id,
        sender_id: messageWithSender[0].sender_id,
        sender_name: messageWithSender[0].sender_name,
        sender_profile_picture: messageWithSender[0].sender_profile_picture,
        message_type: messageWithSender[0].message_type,
        content: messageWithSender[0].content,
        media_url: messageWithSender[0].media_url,
        media_type: messageWithSender[0].media_type,
        file_name: messageWithSender[0].file_name,
        file_size: messageWithSender[0].file_size,
        forwarded_from: messageWithSender[0].forwarded_from,
        original_sender_name: message.original_sender_name,
        created_at: messageWithSender[0].created_at,
        is_forwarded: true,
      });

      forwardRecords.push([message.id, newMessage[0].id, session.user.id]);
    }

    if (forwardRecords.length > 0) {
      const forwardInserts = forwardRecords.map(
        (record) =>
          sql`INSERT INTO message_forwards (original_message_id, forwarded_message_id, forwarded_by) VALUES (${record[0]}, ${record[1]}, ${record[2]})`
      );

      await sql.transaction(forwardInserts);

      await sql`
        UPDATE messages 
        SET forward_count = forward_count + ${forwardRecords.length}
        WHERE id = ${message.forwarded_from || message.id}
      `;
    }

    return {
      success: true,
      original_message_id: message.id,
      forwarded_messages: forwardedMessages,
      forward_count: forwardedMessages.length,
      with_caption: withCaption,
      caption: withCaption ? caption : null,
    };
  } catch (error) {
    console.error("Error forwarding message:", error);
    return { error: "Failed to forward message" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}