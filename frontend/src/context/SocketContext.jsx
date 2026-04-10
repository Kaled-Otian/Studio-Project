import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const socketUrl = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin;
    const newSocket = io(socketUrl, {
      auth: { token: localStorage.getItem('token') } // could pass token here if auth is strictly needed
    });

    setSocket(newSocket);

    return () => newSocket.disconnect();
  }, [user]); // reconnects if user changes

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};
