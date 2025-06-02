const { io } = require('socket.io-client');

const SOCKET_URL = 'http://localhost:5000'; // Adjust if backend runs elsewhere
const roomName = 'testroom';
const userId = 1;

const socket = io(SOCKET_URL, {
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('Connected as', socket.id);
  socket.emit('joinRoom', { roomName, userId });

  // Send a codeChange event
  socket.emit('codeChange', {
    roomName,
    code: 'def foo(): return 42',
    language: 'python',
    userId
  });
});

socket.on('aiQuestion', (data) => {
  console.log('Received aiQuestion:', data);
  socket.disconnect();
});

socket.on('disconnect', () => {
  console.log('Disconnected');
}); 