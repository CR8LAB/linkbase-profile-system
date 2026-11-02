import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import CustomerDashboard from "./pages/CustomerDashboard";
import Profiles from "./pages/profiles.jsx";
import EditProfile from "./pages/EditProfile.jsx";
import CreateProfile from "./pages/CreateProfile.jsx";
import PublicProfile from "./pages/PublicProfile.jsx";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route path="/admin" element={<AdminDashboard />} />

      <Route path="/dashboard" element={<CustomerDashboard />} />

      <Route path="*" element={<Navigate to="/" replace />} />

      <Route path="/admin/profiles" element={<Profiles />} />

      <Route path="/admin/profiles/:publicId/edit" element={<EditProfile />} />

      <Route path="/admin/profiles/create" element={<CreateProfile />} />

      <Route path="/profile/:publicId" element={<PublicProfile />} />
    </Routes>
  );
}

export default App;
