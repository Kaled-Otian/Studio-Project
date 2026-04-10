import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ProtectedRoute } from './components/Layout';
import { Toaster } from 'react-hot-toast';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Shoots from './pages/Shoots';
import ShootDetails from './pages/ShootDetails';
import Profile from './pages/Profile';
import Users from './pages/Users';
import Tasks from './pages/Tasks';
import Schedule from './pages/Schedule';
import Announcements from './pages/Announcements';
import Chat from './pages/Chat';

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1e293b',
                color: '#f8fafc',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: '0.9rem',
              },
            }}
          />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/shoots" element={<Shoots />} />
              <Route path="/shoots/:id" element={<ShootDetails />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/users" element={<Users />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/announcements" element={<Announcements />} />
              <Route path="/chat" element={<Chat />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
