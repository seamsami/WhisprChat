async function handler({
  chatId,
  messageType,
  content,
  mediaUrl,
  mediaType,
  fileName,
  fileSize,
  replyToMessageId,
  disappearingTimer,
  duration,
  waveformData,
  transcription,
}) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!chatId) {
    return { error: "Chat ID is required" };
  }

  if (
    !messageType ||
    ![
      "text",
      "image",
      "video",
      "audio",
      "document",
      "voice_note",
      "system",
    ].includes(messageType)
  ) {
    return { error: "Valid message type is required" };
  }

  if (messageType === "text" && (!content || content.trim().length === 0)) {
    return { error: "Content is required for text messages" };
  }

  if (
    ["image", "video", "audio", "document"].includes(messageType) &&
    !mediaUrl
  ) {
    return { error: "Media URL is required for media messages" };
  }

  if (messageType === "voice_note" && (!mediaUrl || !duration)) {
    return { error: "Media URL and duration are required for voice notes" };
  }

  try {
    const chatCheck = await sql`
      SELECT c.id, c.disappearing_timer, cp.user_id
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE c.id = ${chatId} AND cp.user_id = ${session.user.id}
    `;

    if (chatCheck.length === 0) {
      return { error: "Chat not found or user not a participant" };
    }

    const chat = chatCheck[0];

    if (replyToMessageId) {
      const replyMessage = await sql`
        SELECT id FROM messages 
        WHERE id = ${replyToMessageId} 
          AND chat_id = ${chatId} 
          AND is_deleted = false
      `;

      if (replyMessage.length === 0) {
        return { error: "Reply message not found or deleted" };
      }
    }

    const finalDisappearingTimer = disappearingTimer || chat.disappearing_timer;
    const disappearsAt = finalDisappearingTimer
      ? new Date(Date.now() + finalDisappearingTimer * 1000)
      : null;

    const messageQueries = [];

    const messageQuery = sql`
      INSERT INTO messages (
        chat_id,
        sender_id,
        message_type,
        content,
        media_url,
        media_type,
        file_name,
        file_size,
        reply_to_message_id,
        disappears_at
      ) VALUES (
        ${chatId},
        ${session.user.id},
        ${messageType},
        ${content || null},
        ${mediaUrl || null},
        ${mediaType || null},
        ${fileName || null},
        ${fileSize || null},
        ${replyToMessageId || null},
        ${disappearsAt}
      ) RETURNING *
    `;

    messageQueries.push(messageQuery);

    const updateChatQuery = sql`
      UPDATE chats 
      SET updated_at = now() 
      WHERE id = ${chatId}
    `;

    messageQueries.push(updateChatQuery);

    const [messageResults] = await sql.transaction(messageQueries);
    const newMessage = messageResults[0];

    if (messageType === "voice_note" && newMessage) {
      await sql`
        INSERT INTO voice_notes (
          message_id,
          duration,
          waveform_data,
          transcription
        ) VALUES (
          ${newMessage.id},
          ${duration},
          ${waveformData || null},
          ${transcription || null}
        )
      `;
    }

    const messageWithDetails = await sql`
      SELECT 
        m.*,
        COALESCE(up.display_name, au.name, au.email) as sender_name,
        up.profile_picture as sender_profile_picture,
        vn.duration,
        vn.waveform_data,
        vn.transcription,
        rm.content as reply_content,
        COALESCE(rup.display_name, rau.name, rau.email) as reply_sender_name
      FROM messages m
      JOIN auth_users au ON m.sender_id = au.id
      LEFT JOIN user_profiles up ON au.id = up.user_id
      LEFT JOIN voice_notes vn ON m.id = vn.message_id
      LEFT JOIN messages rm ON m.reply_to_message_id = rm.id
      LEFT JOIN auth_users rau ON rm.sender_id = rau.id
      LEFT JOIN user_profiles rup ON rau.id = rup.user_id
      WHERE m.id = ${newMessage.id}
    `;

    const message = messageWithDetails[0];

    return {
      id: message.id,
      chat_id: message.chat_id,
      sender_id: message.sender_id,
      sender_name: message.sender_name,
      sender_profile_picture: message.sender_profile_picture,
      message_type: message.message_type,
      content: message.content,
      media_url: message.media_url,
      media_type: message.media_type,
      file_name: message.file_name,
      file_size: message.file_size,
      reply_to_message_id: message.reply_to_message_id,
      reply_content: message.reply_content,
      reply_sender_name: message.reply_sender_name,
      is_edited: message.is_edited,
      is_deleted: message.is_deleted,
      disappears_at: message.disappears_at,
      voice_note: message.duration
        ? {
            duration: message.duration,
            waveform_data: message.waveform_data,
            transcription: message.transcription,
          }
        : null,
      created_at: message.created_at,
      updated_at: message.updated_at,
    };
  } catch (error) {
    console.error("Error sending message:", error);
    return { error: "Failed to send message" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}