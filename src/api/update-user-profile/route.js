async function handler({
  displayName,
  bio,
  profilePicture,
  status,
  username,
  phoneNumber,
  showLastSeen,
  showTypingIndicator,
  anonymousMode,
}) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  try {
    if (username) {
      const existingUsername = await sql`
        SELECT id FROM user_profiles 
        WHERE username = ${username} AND user_id != ${session.user.id}
      `;

      if (existingUsername.length > 0) {
        return { error: "Username is already taken" };
      }

      if (username.length < 3 || username.length > 50) {
        return { error: "Username must be between 3 and 50 characters" };
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return {
          error: "Username can only contain letters, numbers, and underscores",
        };
      }
    }

    const existingProfile = await sql`
      SELECT id FROM user_profiles WHERE user_id = ${session.user.id}
    `;

    if (existingProfile.length === 0) {
      const userInfo = await sql`
        SELECT name, email FROM auth_users WHERE id = ${session.user.id}
      `;

      if (userInfo.length === 0) {
        return { error: "User not found" };
      }

      await sql`
        INSERT INTO user_profiles (
          user_id, 
          display_name, 
          bio, 
          profile_picture, 
          status, 
          username, 
          phone_number, 
          show_last_seen, 
          show_typing_indicator, 
          anonymous_mode
        ) VALUES (
          ${session.user.id}, 
          ${displayName || userInfo[0].name || userInfo[0].email}, 
          ${bio || null}, 
          ${profilePicture || null}, 
          ${status || null}, 
          ${username || null}, 
          ${phoneNumber || null}, 
          ${showLastSeen !== undefined ? showLastSeen : true}, 
          ${showTypingIndicator !== undefined ? showTypingIndicator : true}, 
          ${anonymousMode !== undefined ? anonymousMode : false}
        )
      `;
    } else {
      const setClauses = [];
      const values = [];
      let paramCount = 0;

      if (displayName !== undefined) {
        paramCount++;
        setClauses.push(`display_name = $${paramCount}`);
        values.push(displayName);
      }

      if (bio !== undefined) {
        paramCount++;
        setClauses.push(`bio = $${paramCount}`);
        values.push(bio);
      }

      if (profilePicture !== undefined) {
        paramCount++;
        setClauses.push(`profile_picture = $${paramCount}`);
        values.push(profilePicture);
      }

      if (status !== undefined) {
        paramCount++;
        setClauses.push(`status = $${paramCount}`);
        values.push(status);
      }

      if (username !== undefined) {
        paramCount++;
        setClauses.push(`username = $${paramCount}`);
        values.push(username);
      }

      if (phoneNumber !== undefined) {
        paramCount++;
        setClauses.push(`phone_number = $${paramCount}`);
        values.push(phoneNumber);
      }

      if (showLastSeen !== undefined) {
        paramCount++;
        setClauses.push(`show_last_seen = $${paramCount}`);
        values.push(showLastSeen);
      }

      if (showTypingIndicator !== undefined) {
        paramCount++;
        setClauses.push(`show_typing_indicator = $${paramCount}`);
        values.push(showTypingIndicator);
      }

      if (anonymousMode !== undefined) {
        paramCount++;
        setClauses.push(`anonymous_mode = $${paramCount}`);
        values.push(anonymousMode);
      }

      if (setClauses.length > 0) {
        paramCount++;
        setClauses.push(`updated_at = $${paramCount}`);
        values.push(new Date());

        const queryString = `
          UPDATE user_profiles 
          SET ${setClauses.join(", ")} 
          WHERE user_id = $${paramCount + 1}
        `;
        values.push(session.user.id);

        await sql(queryString, values);
      }
    }

    const updatedProfile = await sql`
      SELECT 
        up.id,
        up.user_id,
        up.display_name,
        up.bio,
        up.profile_picture,
        up.status,
        up.phone_number,
        up.username,
        up.last_seen,
        up.is_online,
        up.show_last_seen,
        up.show_typing_indicator,
        up.anonymous_mode,
        up.created_at,
        up.updated_at,
        au.name,
        au.email
      FROM user_profiles up
      JOIN auth_users au ON up.user_id = au.id
      WHERE up.user_id = ${session.user.id}
    `;

    return updatedProfile[0];
  } catch (error) {
    console.error("Error updating user profile:", error);
    return { error: "Failed to update profile" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}