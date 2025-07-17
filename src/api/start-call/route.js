async function handler({ chatId, callType = "voice" }) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!chatId) {
    return { error: "Chat ID is required" };
  }

  if (!["voice", "video"].includes(callType)) {
    return { error: "Call type must be 'voice' or 'video'" };
  }

  try {
    const chatAccess = await sql`
      SELECT 
        c.id,
        c.chat_type,
        c.name,
        cp.role
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE c.id = ${chatId} AND cp.user_id = ${session.user.id}
    `;

    if (chatAccess.length === 0) {
      return { error: "Chat not found or access denied" };
    }

    const chat = chatAccess[0];

    const activeCall = await sql`
      SELECT id, status
      FROM calls
      WHERE chat_id = ${chatId} 
        AND status IN ('initiated', 'ringing', 'answered')
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (activeCall.length > 0) {
      return { error: "There is already an active call in this chat" };
    }

    const newCall = await sql`
      INSERT INTO calls (chat_id, caller_id, call_type, status)
      VALUES (${chatId}, ${session.user.id}, ${callType}, 'initiated')
      RETURNING 
        id,
        chat_id,
        caller_id,
        call_type,
        status,
        started_at,
        created_at
    `;

    const call = newCall[0];

    const chatParticipants = await sql`
      SELECT 
        cp.user_id,
        COALESCE(up.display_name, au.name, au.email) as name,
        up.profile_picture
      FROM chat_participants cp
      JOIN auth_users au ON cp.user_id = au.id
      LEFT JOIN user_profiles up ON au.id = up.user_id
      WHERE cp.chat_id = ${chatId}
    `;

    const participantInserts = chatParticipants
      .map(
        (participant) =>
          `(${call.id}, ${participant.user_id}, '${
            participant.user_id === session.user.id ? "joined" : "invited"
          }')`
      )
      .join(", ");

    if (participantInserts) {
      await sql(`
        INSERT INTO call_participants (call_id, user_id, status)
        VALUES ${participantInserts}
      `);
    }

    const callWithParticipants = await sql`
      SELECT 
        c.*,
        COALESCE(up_caller.display_name, au_caller.name, au_caller.email) as caller_name,
        up_caller.profile_picture as caller_profile_picture,
        ch.name as chat_name,
        ch.chat_type
      FROM calls c
      JOIN auth_users au_caller ON c.caller_id = au_caller.id
      LEFT JOIN user_profiles up_caller ON au_caller.id = up_caller.user_id
      JOIN chats ch ON c.chat_id = ch.id
      WHERE c.id = ${call.id}
    `;

    const participants = await sql`
      SELECT 
        cp.user_id,
        cp.status,
        cp.joined_at,
        COALESCE(up.display_name, au.name, au.email) as name,
        up.profile_picture
      FROM call_participants cp
      JOIN auth_users au ON cp.user_id = au.id
      LEFT JOIN user_profiles up ON au.id = up.user_id
      WHERE cp.call_id = ${call.id}
      ORDER BY cp.joined_at ASC
    `;

    const callData = callWithParticipants[0];

    return {
      id: callData.id,
      chat_id: callData.chat_id,
      chat_name: callData.chat_name,
      chat_type: callData.chat_type,
      caller_id: callData.caller_id,
      caller_name: callData.caller_name,
      caller_profile_picture: callData.caller_profile_picture,
      call_type: callData.call_type,
      status: callData.status,
      started_at: callData.started_at,
      created_at: callData.created_at,
      participants: participants.map((p) => ({
        user_id: p.user_id,
        name: p.name,
        profile_picture: p.profile_picture,
        status: p.status,
        joined_at: p.joined_at,
      })),
    };
  } catch (error) {
    console.error("Error starting call:", error);
    return { error: "Failed to start call" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}