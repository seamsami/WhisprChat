async function handler({ messageId, deleteType = "soft" }) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!messageId) {
    return { error: "Message ID is required" };
  }

  if (!["soft", "hard"].includes(deleteType)) {
    return { error: "Delete type must be 'soft' or 'hard'" };
  }

  try {
    const message = await sql`
      SELECT 
        m.id,
        m.chat_id,
        m.sender_id,
        m.content,
        m.message_type,
        m.is_deleted,
        cp.role
      FROM messages m
      JOIN chat_participants cp ON m.chat_id = cp.chat_id
      WHERE m.id = ${messageId} AND cp.user_id = ${session.user.id}
    `;

    if (message.length === 0) {
      return {
        error: "Message not found or you don't have access to this chat",
      };
    }

    const messageData = message[0];

    if (messageData.is_deleted) {
      return { error: "Message is already deleted" };
    }

    const canDelete =
      messageData.sender_id === session.user.id ||
      messageData.role === "admin" ||
      messageData.role === "moderator";

    if (!canDelete) {
      return {
        error:
          "You can only delete your own messages or you must be an admin/moderator",
      };
    }

    if (deleteType === "soft") {
      const updatedMessage = await sql`
        UPDATE messages 
        SET 
          is_deleted = true,
          content = '[This message was deleted]',
          media_url = null,
          media_type = null,
          file_name = null,
          file_size = null,
          updated_at = now()
        WHERE id = ${messageId}
        RETURNING 
          id,
          chat_id,
          sender_id,
          message_type,
          content,
          is_deleted,
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
        is_deleted: messageWithSender[0].is_deleted,
        created_at: messageWithSender[0].created_at,
        updated_at: messageWithSender[0].updated_at,
        delete_type: "soft",
      };
    } else {
      await sql.transaction([
        sql`DELETE FROM voice_notes WHERE message_id = ${messageId}`,
        sql`DELETE FROM message_translations WHERE message_id = ${messageId}`,
        sql`DELETE FROM message_receipts WHERE message_id = ${messageId}`,
        sql`UPDATE messages SET reply_to_message_id = null WHERE reply_to_message_id = ${messageId}`,
        sql`DELETE FROM messages WHERE id = ${messageId}`,
      ]);

      return {
        id: messageId,
        delete_type: "hard",
        success: true,
      };
    }
  } catch (error) {
    console.error("Error deleting message:", error);
    return { error: "Failed to delete message" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}