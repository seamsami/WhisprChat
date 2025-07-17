"use client";
import React from "react";

function MainComponent() {
  const { data: user, loading: userLoading } = useUser();
  const { signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("chats");
  const [chats, setChats] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Load user profile and chats on mount
  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  // Search users when query changes
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      searchUsers();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const loadUserData = async () => {
    try {
      // Load user profile
      const profileResponse = await fetch("/api/get-user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        setUserProfile(profileData);
      }

      // Load chats
      const chatsResponse = await fetch("/api/list-user-chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      if (chatsResponse.ok) {
        const chatsData = await chatsResponse.json();
        setChats(chatsData || []);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async () => {
    setSearchLoading(true);
    try {
      const response = await fetch("/api/search-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, limit: 10 }),
      });

      if (response.ok) {
        const users = await response.json();
        setSearchResults(users || []);
      }
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setSearchLoading(false);
    }
  };

  const startDirectChat = async (otherUserId) => {
    try {
      const response = await fetch("/api/create-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatType: "direct",
          participantUserIds: [otherUserId],
        }),
      });

      if (response.ok) {
        const newChat = await response.json();
        setChats((prevChats) => [newChat, ...prevChats]);
        setShowNewChatModal(false);
        setSearchQuery("");
        setSearchResults([]);
        // Navigate to the new chat
        window.location.href = `/chat/${newChat.id}`;
      } else {
        const error = await response.json();
        if (error.error === "Direct chat already exists between these users") {
          // Chat already exists, just close modal
          setShowNewChatModal(false);
          setSearchQuery("");
          setSearchResults([]);
        } else {
          console.error("Error creating chat:", error);
        }
      }
    } catch (error) {
      console.error("Error creating chat:", error);
    }
  };

  const handleSignOut = async () => {
    await signOut({
      callbackUrl: "/account/signin",
      redirect: true,
    });
  };

  if (userLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#357AFF] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading WhisprChat...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Welcome to WhisprChat
          </h1>
          <p className="text-gray-600 mb-6">Please sign in to continue</p>
          <a
            href="/account/signin"
            className="inline-block bg-[#357AFF] text-white px-6 py-3 rounded-lg hover:bg-[#2E69DE] transition-colors"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return "Never";
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const ChatItem = ({ chat }) => (
    <a
      href={`/chat/${chat.id}`}
      className="flex items-center p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 block"
    >
      <div className="relative">
        <div className="w-12 h-12 bg-gradient-to-br from-[#357AFF] to-[#2E69DE] rounded-full flex items-center justify-center text-white font-semibold">
          {chat.profile_picture ? (
            <img
              src={chat.profile_picture}
              alt={chat.name}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            chat.name?.charAt(0)?.toUpperCase() || "?"
          )}
        </div>
        {chat.is_online && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
        )}
      </div>
      <div className="ml-3 flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 truncate">
            {chat.name || "Unknown"}
          </h3>
          <span className="text-xs text-gray-500">
            {formatLastSeen(chat.last_message_time)}
          </span>
        </div>
        <p className="text-sm text-gray-600 truncate">
          {chat.last_message || "No messages yet"}
        </p>
      </div>
      {chat.unread_count > 0 && (
        <div className="ml-2 bg-[#357AFF] text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
          {chat.unread_count}
        </div>
      )}
    </a>
  );

  const UserSearchResult = ({ user }) => (
    <div
      className="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
      onClick={() => startDirectChat(user.id)}
    >
      <div className="relative">
        <div className="w-10 h-10 bg-gradient-to-br from-[#357AFF] to-[#2E69DE] rounded-full flex items-center justify-center text-white font-semibold">
          {user.profile_picture ? (
            <img
              src={user.profile_picture}
              alt={user.display_name}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            user.display_name?.charAt(0)?.toUpperCase() || "?"
          )}
        </div>
        {user.is_online && (
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
        )}
      </div>
      <div className="ml-3 flex-1 min-w-0">
        <h4 className="font-medium text-gray-900 truncate">
          {user.display_name}
        </h4>
        <p className="text-sm text-gray-500 truncate">
          {user.username ? `@${user.username}` : user.email}
        </p>
        {user.bio && (
          <p className="text-xs text-gray-400 truncate">{user.bio}</p>
        )}
      </div>
    </div>
  );

  const NewChatModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">New Chat</h2>
            <button
              onClick={() => {
                setShowNewChatModal(false);
                setSearchQuery("");
                setSearchResults([]);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <i className="fas fa-times text-gray-600"></i>
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search users by email, username, or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357AFF] focus:border-transparent"
            />
            <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {searchLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#357AFF]"></div>
            </div>
          ) : searchResults.length > 0 ? (
            <div>
              {searchResults.map((user) => (
                <UserSearchResult key={user.id} user={user} />
              ))}
            </div>
          ) : searchQuery.trim().length > 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <i className="fas fa-user-slash text-2xl mb-2 opacity-50"></i>
              <p>No users found</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <i className="fas fa-search text-2xl mb-2 opacity-50"></i>
              <p>Search for users to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-800">WhisprChat</h1>
            <div className="flex items-center space-x-2">
              <button className="p-2 hover:bg-gray-100 rounded-lg">
                <i className="fas fa-search text-gray-600"></i>
              </button>
              <a
                href="/profile"
                className="p-2 hover:bg-gray-100 rounded-lg"
                title="Profile Settings"
              >
                <i className="fas fa-cog text-gray-600"></i>
              </a>
              <button
                onClick={handleSignOut}
                className="p-2 hover:bg-gray-100 rounded-lg"
                title="Sign Out"
              >
                <i className="fas fa-sign-out-alt text-gray-600"></i>
              </button>
            </div>
          </div>

          {/* User Profile */}
          <a
            href="/profile"
            className="flex items-center space-x-3 hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-[#357AFF] to-[#2E69DE] rounded-full flex items-center justify-center text-white font-semibold">
              {userProfile?.profile_picture ? (
                <img
                  src={userProfile.profile_picture}
                  alt="Profile"
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                (userProfile?.display_name || user.name || user.email)
                  ?.charAt(0)
                  ?.toUpperCase() || "?"
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">
                {userProfile?.display_name || user.name || "User"}
              </p>
              <p className="text-sm text-gray-500 truncate">
                {userProfile?.status || "Available"}
              </p>
            </div>
          </a>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200">
          {[
            { id: "chats", label: "Chats", icon: "fas fa-comments" },
            { id: "groups", label: "Groups", icon: "fas fa-users" },
            {
              id: "channels",
              label: "Channels",
              icon: "fas fa-broadcast-tower",
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-[#357AFF] text-[#357AFF]"
                  : "border-transparent text-gray-600 hover:text-gray-800"
              }`}
            >
              <i className={`${tab.icon} mr-2`}></i>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <i className="fas fa-comments text-4xl mb-4 opacity-50"></i>
              <p className="text-center">No chats yet</p>
              <p className="text-sm text-center mt-2">
                Start a conversation to get started
              </p>
            </div>
          ) : (
            chats.map((chat) => <ChatItem key={chat.id} chat={chat} />)
          )}
        </div>

        {/* New Chat Button */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => setShowNewChatModal(true)}
            className="w-full bg-[#357AFF] text-white py-3 px-4 rounded-lg hover:bg-[#2E69DE] transition-colors flex items-center justify-center"
          >
            <i className="fas fa-plus mr-2"></i>
            New Chat
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-[#357AFF] to-[#2E69DE] rounded-full flex items-center justify-center text-white text-3xl mb-6 mx-auto">
            <i className="fas fa-comments"></i>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Welcome to WhisprChat
          </h2>
          <p className="text-gray-600 mb-6">Select a chat to start messaging</p>
          <div className="space-y-2 text-sm text-gray-500">
            <p>
              <i className="fas fa-shield-alt mr-2 text-green-500"></i>
              End-to-end encrypted
            </p>
            <p>
              <i className="fas fa-eye-slash mr-2 text-blue-500"></i>
              Privacy-first messaging
            </p>
            <p>
              <i className="fas fa-language mr-2 text-purple-500"></i>AI
              auto-translation
            </p>
          </div>
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && <NewChatModal />}
    </div>
  );
}

export default MainComponent;