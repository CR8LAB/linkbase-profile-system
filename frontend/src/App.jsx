import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import CustomerDashboard from "./pages/CustomerDashboard";
import Profiles from "./pages/profiles.jsx";
import EditProfile from "./pages/EditProfile.jsx";
import CreateProfile from "./pages/CreateProfile.jsx";
import PublicProfile from "./pages/PublicProfile.jsx";
import EditMyProfile from "./pages/EditMyProfile";
import ManageSocialLinks from "./pages/ManageSocialLinks";
import ClaimProfile from "./pages/ClaimProfile.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/claim" element={<ClaimProfile />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/admin" element={<AdminDashboard />} />

      <Route path="/dashboard" element={<CustomerDashboard />} />

      <Route path="*" element={<Navigate to="/" replace />} />

      <Route path="/admin/profiles" element={<Profiles />} />

      <Route path="/admin/profiles/:publicId/edit" element={<EditProfile />} />

      <Route path="/admin/profiles/create" element={<CreateProfile />} />

      <Route path="/profile/:publicId" element={<PublicProfile />} />

      <Route path="/dashboard/edit" element={<EditMyProfile />} />

      <Route path="/dashboard/social-links" element={<ManageSocialLinks />} />
    </Routes>
  );
}

export default App;
