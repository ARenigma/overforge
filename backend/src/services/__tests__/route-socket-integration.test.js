const http = require('http');
const express = require('express');
const ioClient = require('socket.io-client');
const { initializeSocket } = require('../../sockets');

jest.setTimeout(15000);

describe('Route and Socket integration (minimal harness)', () => {
  let server;
  let address;

  beforeAll((done) => {
    const app = express();
    app.get('/health', (req, res) => res.json({ status: 'OK' }));
    server = http.createServer(app);
    initializeSocket(server);
    server.listen(0, () => {
      address = server.address();
      done();
    });
  });

  afterAll((done) => {
    try {
      server && server.close(done);
    } catch (e) {
      done();
    }
  });

  test('GET /health returns OK', async () => {
    const port = address.port;
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe('OK');
  });

  test('socket joinRoom and chat', (done) => {
    const port = address.port;
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });

    socket.on('connect', () => {
      socket.emit('joinRoom', {
        roomName: 'sess-int-1',
        userId: 'u1',
        username: 'User1',
        language: 'javascript',
        experienceLevel: 'junior'
      });

      setTimeout(() => {
        socket.emit('chatMessage', { roomName: 'sess-int-1', message: 'hello world', userId: 'u1', username: 'User1' });
        socket.emit('getChatHistory', 'sess-int-1', (messages) => {
          try {
            expect(Array.isArray(messages)).toBe(true);
            expect(messages.length).toBeGreaterThanOrEqual(1);
            socket.disconnect();
            done();
          } catch (e) {
            done(e);
          }
        });
      }, 200);
    });

    socket.on('connect_error', (err) => done(err));
  });
});
