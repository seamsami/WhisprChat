require('dotenv').config();
const { WebSocketServer } = require('ws');
const { parse } = require('url');
const jwt = require('jsonwebtoken');

// Secure authentication logic
const getSession = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { user: { id: decoded.userId } };
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return null;
  }
};

const wss = new WebSocketServer({ 
  port: process.env.WS_PORT || 8080,
  maxPayload: 1024 * 1024, // 1MB max payload
  clientTracking: true 
});

const connections = new Map();
let connectionCount = 0;

wss.on('connection', async (ws, req) => {
  if (connectionCount >= (process.env.WS_MAX_CONNECTIONS || 1000)) {
    ws.close(1008, 'Server at maximum capacity');
    return;
  }

  const { query } = parse(req.url, true);
  const token = query.token;

  const session = getSession(token);

  if (!session) {
    ws.close(1008, 'Invalid or expired authentication token');
    return;
  }

  const userId = session.user.id;
  const connectionId = `conn_${Math.random().toString(36).substring(2, 15)}`;

  connections.set(connectionId, { ws, userId });
  connectionCount++;

  // Periodic ping to maintain connection
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, process.env.WS_PING_INTERVAL || 30000);

  ws.on('message', async (rawMessage) => {
    try {
      const message = rawMessage.toString();
      const { action, data } = JSON.parse(message);
      
      // Basic rate limiting
      if (!isValidRequest(action, data)) {
        throw new Error('Invalid request');
      }

      const response = await handleWebSocketActions(userId, connectionId, action, data);
      ws.send(JSON.stringify(response));
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ 
        error: 'Invalid message format', 
        details: error.message 
      }));
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    connections.delete(connectionId);
    connectionCount--;
    handleDisconnect(userId, { connectionId });
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clearInterval(pingInterval);
  });

  ws.on('pong', () => {
    // Connection is alive
    ws.isAlive = true;
  });

  // Send confirmation after successful connection
  ws.send(JSON.stringify({ 
    success: true, 
    message: 'Connected to WhisprChat WebSocket server',
    connectionId 
  }));
});

// Basic request validation
function isValidRequest(action, data) {
  // Add more specific validations based on action
  switch(action) {
    case 'message_broadcast':
      return data && data.chatId && data.content;
    case 'typing_start':
    case 'typing_stop':
      return data && data.chatId;
    case 'status_update':
      return data && data.status;
    default:
      return true;
  }
}

wss.on('listening', () => {
  console.log(`WebSocket server started on port ${process.env.WS_PORT || 8080}`);
});

// Existing WebSocket action handlers remain the same

async function handleWebSocketActions(userId, connectionId, action, data) {
  try {
    switch (action) {
      case 'connect':
        return await handleConnect(userId, { ...data, connectionId });
      case 'typing_start':
        return await handleTypingStart(userId, data);
      case 'typing_stop':
        return await handleTypingStop(userId, data);
      case 'status_update':
        return await handleStatusUpdate(userId, data);
      case 'message_broadcast':
        return await handleMessageBroadcast(userId, data);
      case 'call_signal':
        return await handleCallSignal(userId, data);
      case 'ping':
        return await handlePing(userId, { ...data, connectionId });
      default:
        return { error: 'Unknown action' };
    }
  } catch (error) {
    console.error(`Error in action '${action}':`, error);
    return { error: 'Internal server error' };
  }
}

// Placeholder functions - replace with your actual logic from route.js
async function handleConnect(userId, data) {
  console.log(`User ${userId} connected with connection ID ${data.connectionId}`);
  return { success: true, connectionId: data.connectionId, userId };
}

async function handleDisconnect(userId, data) {
  console.log(`User ${userId} disconnected from connection ID ${data.connectionId}`);
  return { success: true };
}

async function handleTypingStart(userId, data) {
  console.log(`User ${userId} started typing in chat ${data.chatId}`);
  // Broadcast typing event to other users in the chat
  return { success: true, action: 'typing_start', userId, chatId: data.chatId };
}

async function handleTypingStop(userId, data) {
  console.log(`User ${userId} stopped typing in chat ${data.chatId}`);
  // Broadcast typing event to other users in the chat
  return { success: true, action: 'typing_stop', userId, chatId: data.chatId };
}

async function handleStatusUpdate(userId, data) {
  console.log(`User ${userId} updated status to:`, data);
  // Update user status and broadcast to relevant users
  return { success: true, userId, status: data };
}

async function handleMessageBroadcast(userId, data) {
  console.log(`User ${userId} broadcasted message in chat ${data.chatId}:`, data.content);
  // Broadcast message to other users in the chat
  return { success: true, message: data };
}

async function handleCallSignal(userId, data) {
  console.log(`User ${userId} sent call signal:`, data);
  // Forward call signal to the target user
  return { success: true, signal: data };
}

async function handlePing(userId, data) {
  console.log(`User ${userId} sent a ping from connection ID ${data.connectionId}`);
  return { success: true, message: 'pong' };
}

console.log('WebSocket server started on port 8080');