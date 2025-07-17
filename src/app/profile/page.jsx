"use client";
import React from "react";

import { useUpload } from "../utilities/runtime-helpers";

function MainComponent() {
  const { data: user, loading: userLoading } = useUser();
  const { signOut } = useAuth();
  const [upload, { loading: uploadLoading }] = useUpload();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState("");
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [showLastSeen, setShowLastSeen] = useState(true);
  const [showTypingIndicator, setShowTypingIndicator] = useState(true);
  const [anonymousMode, setAnonymousMode] = useState(false);

  // File upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/get-user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      if (response.ok) {
        const profileData = await response.json();
        setProfile(profileData);

        // Populate form fields
        setDisplayName(profileData.display_name || "");
        setBio(profileData.bio || "");
        setStatus(profileData.status || "");
        setUsername(profileData.username || "");
        setPhoneNumber(profileData.phone_number || "");
        setProfilePicture(profileData.profile_picture || "");
        setShowLastSeen(profileData.show_last_seen !== false);
        setShowTypingIndicator(profileData.show_typing_indicator !== false);
        setAnonymousMode(profileData.anonymous_mode || false);
      } else {
        setError("Failed to load profile");
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      setError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB");
      return;
    }

    setSelectedFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const uploadProfilePicture = async () => {
    if (!selectedFile) return profilePicture;

    try {
      const { url, error } = await upload({ file: selectedFile });

      if (error) {
        throw new Error(error);
      }

      return url;
    } catch (error) {
      console.error("Error uploading image:", error);
      throw new Error("Failed to upload image");
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      let finalProfilePicture = profilePicture;

      if (selectedFile) {
        finalProfilePicture = await uploadProfilePicture();
      }

      const response = await fetch("/api/update-user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim(),
          status: status.trim(),
          username: username.trim() || null,
          phoneNumber: phoneNumber.trim() || null,
          profilePicture: finalProfilePicture,
          showLastSeen,
          showTypingIndicator,
          anonymousMode,
        }),
      });

      if (response.ok) {
        const updatedProfile = await response.json();
        setProfile(updatedProfile);
        setProfilePicture(updatedProfile.profile_picture || "");
        setSelectedFile(null);
        setImagePreview(null);
        setSuccess("Profile updated successfully!");

        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to update profile");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      setError("Failed to update profile");
    } finally {
      setSaving(false);
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
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Please sign in
          </h1>
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

  const currentProfilePicture = imagePreview || profilePicture;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <a
                href="/chat"
                className="p-2 hover:bg-gray-100 rounded-lg"
                title="Back to Chat"
              >
                <i className="fas fa-arrow-left text-gray-600"></i>
              </a>
              <h1 className="text-xl font-bold text-gray-800">
                Profile Settings
              </h1>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <i className="fas fa-sign-out-alt"></i>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSave} className="space-y-8">
          {/* Profile Picture Section */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-6">
              Profile Picture
            </h2>
            <div className="flex items-center space-x-6">
              <div className="relative">
                <div className="w-24 h-24 bg-gradient-to-br from-[#357AFF] to-[#2E69DE] rounded-full flex items-center justify-center text-white text-2xl font-semibold overflow-hidden">
                  {currentProfilePicture ? (
                    <img
                      src={currentProfilePicture}
                      alt="Profile"
                      className="w-24 h-24 rounded-full object-cover"
                    />
                  ) : (
                    (displayName || user.name || user.email)
                      ?.charAt(0)
                      ?.toUpperCase() || "?"
                  )}
                </div>
                {uploadLoading && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="profile-picture-input"
                />
                <label
                  htmlFor="profile-picture-input"
                  className="inline-block bg-[#357AFF] text-white px-4 py-2 rounded-lg hover:bg-[#2E69DE] transition-colors cursor-pointer"
                >
                  <i className="fas fa-camera mr-2"></i>
                  Change Picture
                </label>
                <p className="text-sm text-gray-500 mt-2">
                  JPG, PNG or GIF. Max size 5MB.
                </p>
              </div>
            </div>
          </div>

          {/* Basic Information */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-6">
              Basic Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357AFF] focus:border-transparent"
                  placeholder="Your display name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357AFF] focus:border-transparent"
                  placeholder="@username (optional)"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Letters, numbers, and underscores only
                </p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357AFF] focus:border-transparent resize-none"
                  placeholder="Tell others about yourself..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <input
                  type="text"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357AFF] focus:border-transparent"
                  placeholder="Available, Busy, Away..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357AFF] focus:border-transparent"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>
          </div>

          {/* Privacy Settings */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-6">
              Privacy Settings
            </h2>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-800">Show Last Seen</h3>
                  <p className="text-sm text-gray-500">
                    Let others see when you were last online
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showLastSeen}
                    onChange={(e) => setShowLastSeen(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#357AFF]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#357AFF]"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-800">
                    Show Typing Indicator
                  </h3>
                  <p className="text-sm text-gray-500">
                    Show when you're typing in chats
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTypingIndicator}
                    onChange={(e) => setShowTypingIndicator(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#357AFF]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#357AFF]"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-800">Anonymous Mode</h3>
                  <p className="text-sm text-gray-500">
                    Hide your identity in group chats
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={anonymousMode}
                    onChange={(e) => setAnonymousMode(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#357AFF]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#357AFF]"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Account Information */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-6">
              Account Information
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div>
                  <h3 className="font-medium text-gray-800">Email</h3>
                  <p className="text-sm text-gray-500">{user.email}</p>
                </div>
                <span className="text-sm text-gray-400">Cannot be changed</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div>
                  <h3 className="font-medium text-gray-800">Account Created</h3>
                  <p className="text-sm text-gray-500">
                    {profile?.created_at
                      ? new Date(profile.created_at).toLocaleDateString()
                      : "Unknown"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Error and Success Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <i className="fas fa-exclamation-circle text-red-500 mr-3"></i>
                <p className="text-red-700">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center">
                <i className="fas fa-check-circle text-green-500 mr-3"></i>
                <p className="text-green-700">{success}</p>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end space-x-4">
            <a
              href="/chat"
              className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </a>
            <button
              type="submit"
              disabled={saving || uploadLoading}
              className="px-6 py-3 bg-[#357AFF] text-white rounded-lg hover:bg-[#2E69DE] transition-colors disabled:opacity-50 flex items-center"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <i className="fas fa-save mr-2"></i>
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MainComponent;