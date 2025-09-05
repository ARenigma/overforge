const io = require('socket.io-client');

const testConfig = {
  sessionId: 'test-storage-' + Date.now(),
  candidateId: 'candidate123',
  language: 'Java',
  jobProfileId: 10
};

async function testChatStorage() {
  console.log('🧪 Testing Chat Storage Fix...');
  
  let messagesReceived = 0;
  let chatHistoryReceived = false;
  
  const socket = io('http://localhost:3001');
  
  socket.on('connect', async () => {
    console.log('✅ Socket connected:', socket.id);
    
    socket.on('chatMessage', (message) => {
      messagesReceived++;
      console.log('📨 Chat Message Received:', message.username, '-', message.message?.substring(0, 50) + '...');
      if (message.questionContext?.type === 'parameter_question') {
        console.log('🎯 Parameter Question:', message.questionContext.parameterName);
      }
    });

    console.log('📡 Joining room...');
    socket.emit('joinRoom', {
      roomName: testConfig.sessionId,
      userId: testConfig.candidateId,
      username: 'TestUser',
      language: testConfig.language,
      experienceLevel: '5+ Years',
      jobProfile: testConfig.jobProfileId,
      role: 'candidate'
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('📝 Sending code change...');
    const javaCode = 'public Product createProduct(ProductRequest request) { Product product = new Product(); product.setProductId(UUID.randomUUID().toString()); return productMapper.save(product); }';

    socket.emit('codeChange', {
      roomName: testConfig.sessionId,
      questionId: 'main',
      code: javaCode,
      language: testConfig.language,
      userId: testConfig.candidateId
    });

    await new Promise(resolve => setTimeout(resolve, 6000));

    console.log('📚 Testing chat history...');
    socket.emit('getChatHistory', testConfig.sessionId, (chatHistory) => {
      chatHistoryReceived = true;
      console.log('✅ Chat History:', chatHistory.length, 'messages');
      
      const parameterQuestions = chatHistory.filter(msg => msg.questionContext?.type === 'parameter_question');
      console.log('🎯 Parameter Questions in History:', parameterQuestions.length);
      
      if (parameterQuestions.length > 0) {
        console.log('🎉 SUCCESS: Parameter questions are persisted!');
      } else {
        console.log('❌ No parameter questions in history');
      }
      
      socket.disconnect();
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
    if (!chatHistoryReceived) {
      console.log('❌ Chat history not received');
      socket.disconnect();
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Disconnected');
    process.exit(0);
  });
}

testChatStorage().catch(console.error); 