async function handler({ messageId, newContent }) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!messageId) {
    return { error: "Message ID is required" };
  }

  if (
    !newContent ||
    typeof newContent !== "string" ||
    newContent.trim().length === 0
  ) {
    return { error: "New content is required" };
  }

  const trimmedContent = newContent.trim();

  try {
    const message = await sql`
      SELECT 
        m.id,
        m.sender_id,
        m.content,
        m.message_type,
        m.created_at,
        m.is_deleted,
        c.disappearing_timer
      FROM messages m
      JOIN chats c ON m.chat_id = c.id
      WHERE m.id = ${messageId}
    `;

    if (message.length === 0) {
      return { error: "Message not found" };
    }

    const messageData = message[0];

    if (messageData.sender_id !== session.user.id) {
      return { error: "You can only edit your own messages" };
    }

    if (messageData.is_deleted) {
      return { error: "Cannot edit deleted messages" };
    }

    if (messageData.message_type !== "text") {
      return { error: "Only text messages can be edited" };
    }

    const now = new Date();
    const messageAge = now - new Date(messageData.created_at);
    const editTimeLimit = 15 * 60 * 1000; // 15 minutes in milliseconds

    if (messageAge > editTimeLimit) {
      return {
        error: "Messages can only be edited within 15 minutes of sending",
      };
    }

    if (messageData.content === trimmedContent) {
      return { error: "New content must be different from current content" };
    }

    const updatedMessage = await sql`
      UPDATE messages 
      SET 
        content = ${trimmedContent},
        is_edited = true,
        updated_at = now()
      WHERE id = ${messageId}
      RETURNING 
        id,
        chat_id,
        sender_id,
        message_type,
        content,
        media_url,
        media_type,
        file_name,
        file_size,
        reply_to_message_id,
        is_edited,
        is_deleted,
        disappears_at,
        created_at,
        updated_at
    `;

    const messageWithSender = await sql`
      SELECT 
        m.*,
        COALESCE(up.display_name, au.name, au.email) as sender_name,
        up.profile_picture as sender_profile_picture
      FROM messages m
      JOIN auth_users au ON m.sender_id = au.id
      LEFT JOIN user_profiles up ON au.id = up.user_id
      WHERE m.id = ${messageId}
    `;

    return {
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
      reply_to_message_id: messageWithSender[0].reply_to_message_id,
      is_edited: messageWithSender[0].is_edited,
      is_deleted: messageWithSender[0].is_deleted,
      disappears_at: messageWithSender[0].disappears_at,
      created_at: messageWithSender[0].created_at,
      updated_at: messageWithSender[0].updated_at,
    };
  } catch (error) {
    console.error("Error editing message:", error);
    return { error: "Failed to edit message" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}