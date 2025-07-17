async function handler({ action, data }) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  const userId = session.user.id;

  try {
    switch (action) {
      case "connect":
        return await handleConnect(userId, data);

      case "disconnect":
        return await handleDisconnect(userId, data);

      case "typing_start":
        return await handleTypingStart(userId, data);

      case "typing_stop":
        return await handleTypingStop(userId, data);

      case "status_update":
        return await handleStatusUpdate(userId, data);

      case "message_broadcast":
        return await handleMessageBroadcast(userId, data);

      case "call_signal":
        return await handleCallSignal(userId, data);

      case "ping":
        return await handlePing(userId, data);

      default:
        return { error: "Unknown action" };
    }
  } catch (error) {
    console.error("WebSocket handler error:", error);
    return { error: "Internal server error" };
  }
}

async function handleConnect(userId, data) {
  const { connectionId, userAgent, ipAddress } = data;

  if (!connectionId) {
    return { error: "Connection ID required" };
  }

  await sql`
    INSERT INTO websocket_connections (user_id, connection_id, user_agent, ip_address)
    VALUES (${userId}, ${connectionId}, ${userAgent || null}, ${
    ipAddress || null
  })
    ON CONFLICT (connection_id) 
    DO UPDATE SET 
      last_ping = now(),
      user_agent = EXCLUDED.user_agent,
      ip_address = EXCLUDED.ip_address
  `;

  await sql`
    UPDATE user_profiles 
    SET is_online = true, last_seen = now()
    WHERE user_id = ${userId}
  `;

  const userChats = await sql`
    SELECT DISTINCT cp.chat_id
    FROM chat_participants cp
    WHERE cp.user_id = ${userId}
  `;

  return {
    success: true,
    connectionId,
    userId,
    chatIds: userChats.map((chat) => chat.chat_id),
    timestamp: new Date().toISOString(),
  };
}

async function handleDisconnect(userId, data) {
  const { connectionId } = data;

  if (connectionId) {
    await sql`
      DELETE FROM websocket_connections 
      WHERE connection_id = ${connectionId}
    `;
  }

  const remainingConnections = await sql`
    SELECT COUNT(*) as count
    FROM websocket_connections
    WHERE user_id = ${userId}
  `;

  if (parseInt(remainingConnections[0].count) === 0) {
    await sql`
      UPDATE user_profiles 
      SET is_online = false, last_seen = now()
      WHERE user_id = ${userId}
    `;
  }

  await sql`
    DELETE FROM typing_indicators
    WHERE user_id = ${userId}
  `;

  return {
    success: true,
    userId,
    isOnline: parseInt(remainingConnections[0].count) > 0,
    timestamp: new Date().toISOString(),
  };
}

async function handleTypingStart(userId, data) {
  const { chatId } = data;

  if (!chatId) {
    return { error: "Chat ID required" };
  }

  const isParticipant = await sql`
    SELECT id FROM chat_participants
    WHERE chat_id = ${chatId} AND user_id = ${userId}
  `;

  if (isParticipant.length === 0) {
    return { error: "Not a participant in this chat" };
  }

  await sql`
    INSERT INTO typing_indicators (chat_id, user_id, started_at, expires_at)
    VALUES (${chatId}, ${userId}, now(), now() + interval '10 seconds')
    ON CONFLICT (chat_id, user_id)
    DO UPDATE SET 
      started_at = now(),
      expires_at = now() + interval '10 seconds'
  `;

  const typingUsers = await sql`
    SELECT 
      ti.user_id,
      COALESCE(up.display_name, au.name, au.email) as name,
      up.profile_picture
    FROM typing_indicators ti
    JOIN auth_users au ON ti.user_id = au.id
    LEFT JOIN user_profiles up ON au.id = up.user_id
    WHERE ti.chat_id = ${chatId} 
      AND ti.expires_at > now()
      AND ti.user_id != ${userId}
  `;

  return {
    success: true,
    chatId: parseInt(chatId),
    userId,
    action: "typing_start",
    typingUsers: typingUsers.map((user) => ({
      id: user.user_id,
      name: user.name,
      profilePicture: user.profile_picture,
    })),
    timestamp: new Date().toISOString(),
  };
}

async function handleTypingStop(userId, data) {
  const { chatId } = data;

  if (!chatId) {
    return { error: "Chat ID required" };
  }

  await sql`
    DELETE FROM typing_indicators
    WHERE chat_id = ${chatId} AND user_id = ${userId}
  `;

  const typingUsers = await sql`
    SELECT 
      ti.user_id,
      COALESCE(up.display_name, au.name, au.email) as name,
      up.profile_picture
    FROM typing_indicators ti
    JOIN auth_users au ON ti.user_id = au.id
    LEFT JOIN user_profiles up ON au.id = up.user_id
    WHERE ti.chat_id = ${chatId} 
      AND ti.expires_at > now()
  `;

  return {
    success: true,
    chatId: parseInt(chatId),
    userId,
    action: "typing_stop",
    typingUsers: typingUsers.map((user) => ({
      id: user.user_id,
      name: user.name,
      profilePicture: user.profile_picture,
    })),
    timestamp: new Date().toISOString(),
  };
}

async function handleStatusUpdate(userId, data) {
  const { status, showLastSeen, isOnline } = data;

  const updateFields = [];
  const updateValues = [];
  let paramCount = 0;

  if (status !== undefined) {
    updateFields.push(`status = $${++paramCount}`);
    updateValues.push(status);
  }

  if (showLastSeen !== undefined) {
    updateFields.push(`show_last_seen = $${++paramCount}`);
    updateValues.push(showLastSeen);
  }

  if (isOnline !== undefined) {
    updateFields.push(`is_online = $${++paramCount}`);
    updateValues.push(isOnline);

    if (isOnline) {
      updateFields.push(`last_seen = $${++paramCount}`);
      updateValues.push(new Date());
    }
  }

  if (updateFields.length === 0) {
    return { error: "No valid fields to update" };
  }

  updateFields.push(`updated_at = $${++paramCount}`);
  updateValues.push(new Date());

  updateValues.push(userId);

  const query = `
    UPDATE user_profiles 
    SET ${updateFields.join(", ")}
    WHERE user_id = $${++paramCount}
    RETURNING user_id, status, is_online, last_seen, show_last_seen
  `;

  const result = await sql(query, updateValues);

  if (result.length === 0) {
    return { error: "User profile not found" };
  }

  return {
    success: true,
    userId,
    profile: {
      status: result[0].status,
      isOnline: result[0].is_online,
      lastSeen: result[0].last_seen,
      showLastSeen: result[0].show_last_seen,
    },
    timestamp: new Date().toISOString(),
  };
}

async function handleMessageBroadcast(userId, data) {
  const { chatId, messageId, messageType, content, recipientIds } = data;

  if (!chatId || !messageId) {
    return { error: "Chat ID and message ID required" };
  }

  const isParticipant = await sql`
    SELECT id FROM chat_participants
    WHERE chat_id = ${chatId} AND user_id = ${userId}
  `;

  if (isParticipant.length === 0) {
    return { error: "Not a participant in this chat" };
  }

  const message = await sql`
    SELECT 
      m.*,
      COALESCE(up.display_name, au.name, au.email) as sender_name,
      up.profile_picture as sender_profile_picture
    FROM messages m
    JOIN auth_users au ON m.sender_id = au.id
    LEFT JOIN user_profiles up ON au.id = up.user_id
    WHERE m.id = ${messageId} AND m.chat_id = ${chatId}
  `;

  if (message.length === 0) {
    return { error: "Message not found" };
  }

  const chatParticipants = await sql`
    SELECT user_id FROM chat_participants
    WHERE chat_id = ${chatId} AND user_id != ${userId}
  `;

  const targetRecipients =
    recipientIds && recipientIds.length > 0
      ? recipientIds
      : chatParticipants.map((p) => p.user_id);

  return {
    success: true,
    chatId: parseInt(chatId),
    messageId: parseInt(messageId),
    senderId: userId,
    message: {
      id: message[0].id,
      chatId: message[0].chat_id,
      senderId: message[0].sender_id,
      senderName: message[0].sender_name,
      senderProfilePicture: message[0].sender_profile_picture,
      messageType: message[0].message_type,
      content: message[0].content,
      mediaUrl: message[0].media_url,
      mediaType: message[0].media_type,
      fileName: message[0].file_name,
      fileSize: message[0].file_size,
      replyToMessageId: message[0].reply_to_message_id,
      isEdited: message[0].is_edited,
      isDeleted: message[0].is_deleted,
      createdAt: message[0].created_at,
      updatedAt: message[0].updated_at,
    },
    recipients: targetRecipients,
    timestamp: new Date().toISOString(),
  };
}

async function handleCallSignal(userId, data) {
  const { callId, signalType, signalData, targetUserId } = data;

  if (!callId || !signalType) {
    return { error: "Call ID and signal type required" };
  }

  const call = await sql`
    SELECT c.*, cp.user_id as participant_id
    FROM calls c
    JOIN call_participants cp ON c.id = cp.call_id
    WHERE c.id = ${callId} AND cp.user_id = ${userId}
  `;

  if (call.length === 0) {
    return { error: "Call not found or access denied" };
  }

  const callParticipants = await sql`
    SELECT user_id FROM call_participants
    WHERE call_id = ${callId} AND user_id != ${userId}
  `;

  const targetRecipients = targetUserId
    ? [targetUserId]
    : callParticipants.map((p) => p.user_id);

  return {
    success: true,
    callId: parseInt(callId),
    signalType,
    signalData,
    senderId: userId,
    recipients: targetRecipients,
    timestamp: new Date().toISOString(),
  };
}

async function handlePing(userId, data) {
  const { connectionId } = data;

  if (connectionId) {
    await sql`
      UPDATE websocket_connections 
      SET last_ping = now()
      WHERE connection_id = ${connectionId} AND user_id = ${userId}
    `;
  }

  await sql`
    DELETE FROM typing_indicators
    WHERE expires_at < now()
  `;

  return {
    success: true,
    userId,
    timestamp: new Date().toISOString(),
  };
}
export async function POST(request) {
  return handler(await request.json());
}