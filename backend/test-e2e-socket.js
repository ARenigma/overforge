const axios = require('axios');
const io = require('socket.io-client');

const API = 'http://localhost:5000/api';

async function main() {
  // 1. Register
  let token, userId;
  try {
    await axios.post(`${API}/users/signup`, {
      username: 'alice',
      email: 'alice@example.com',
      password: 'password123'
    });
    console.log('Signup: success');
  } catch (err) {
    if (err.response && err.response.status === 409) {
      console.log('Signup: user already exists, continuing...');
    } else {
      throw err;
    }
  }

  // 2. Login
  const loginRes = await axios.post(`${API}/users/login`, {
    usernameOrEmail: 'alice',
    password: 'password123'
  });
  token = loginRes.data.token;
  userId = loginRes.data.user.id;
  console.log('Login: success');

  // 3. Create Room
  try {
    await axios.post(`${API}/rooms`, { name: 'room1' }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Room created: room1');
  } catch (err) {
    if (err.response && err.response.status === 409) {
      console.log('Room already exists, continuing...');
    } else {
      throw err;
    }
  }

  // 4. Connect via Socket.io and test real-time features
  const socket = io("http://localhost:5000", {
    auth: { token }
  });

  socket.on("connect", () => {
    console.log("Socket connected");
    socket.emit("joinRoom", { roomName: "room1", userId });
  });

  socket.on("aiQuestion", (data) => {
    console.log("AI Question:", data);
    socket.disconnect();
    process.exit(0);
  });

  socket.on("codeUpdate", (data) => {
    console.log("Code Update:", data);
  });

  socket.on("chatMessage", (data) => {
    console.log("Chat Message:", data);
  });

  // Send a code change after joining
  setTimeout(() => {
    socket.emit("codeChange", {
      roomName: "room1",
      code: "def add(a, b): return a + b",
      language: "python",
      userId
    });
  }, 2000);

  // Send a chat message after joining
  setTimeout(() => {
    socket.emit("chatMessage", {
      roomName: "room1",
      userId,
      message: "Hello from E2E test!"
    });
  }, 3000);

  // Timeout in case AI doesn't respond
  setTimeout(() => {
    console.log("Test timed out (no AI response)");
    socket.disconnect();
    process.exit(1);
  }, 20000);
}

main().catch(err => {
  if (err.response) {
    console.error('Error:', err.response.data);
  } else {
    console.error('Error:', err.message);
  }
  process.exit(1);
});