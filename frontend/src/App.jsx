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
import CompanyManagement from "./pages/CompanyManagement.jsx";
import CustomerManagement from "./pages/CustomerManagement.jsx";
import RequireRole from "./components/RequireRole.jsx";
import ShortUrlRedirect from "./pages/ShortUrlRedirect.jsx";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/claim" element={<ClaimProfile />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<RequireRole role="ADMIN" />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/companies" element={<CompanyManagement />} />
        <Route path="/admin/customers" element={<CustomerManagement />} />
        <Route path="/admin/profiles" element={<Profiles />} />
        <Route
          path="/admin/profiles/:publicId/edit"
          element={<EditProfile />}
        />
        <Route path="/admin/profiles/create" element={<CreateProfile />} />
      </Route>

      <Route element={<RequireRole role="CUSTOMER" />}>
        <Route path="/dashboard" element={<CustomerDashboard />} />
        <Route path="/dashboard/edit" element={<EditMyProfile />} />
        <Route path="/dashboard/social-links" element={<ManageSocialLinks />} />
      </Route>

      <Route path="/profile/:publicId" element={<PublicProfile />} />
      <Route path="/:shortCode" element={<ShortUrlRedirect />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
