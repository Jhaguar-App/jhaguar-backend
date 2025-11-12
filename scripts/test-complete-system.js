#!/usr/bin/env node

const axios = require('axios');
const { io } = require('socket.io-client');

// Configuration
const SERVER_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const SOCKET_URL = process.env.BACKEND_URL || 'http://localhost:3000';

// Test credentials (from seed data)
const TEST_PASSENGER = {
  email: 'passenger1@jhaguar.com',
  password: 'password123'
};

const TEST_DRIVER = {
  email: 'driver1@jhaguar.com',
  password: 'password123'
};

// Test data
const TEST_RIDE_DATA = {
  origin: {
    latitude: -23.561684,
    longitude: -46.655981,
    address: 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP'
  },
  destination: {
    latitude: -23.550520,
    longitude: -46.633308,
    address: 'Shopping Cidade São Paulo - Av. Paulista, 1230'
  },
  rideTypeId: 'normal', // Will be updated with actual ID
  estimatedDistance: 2.5,
  estimatedDuration: 10,
  paymentMethod: 'CASH'
};

class CompleteSystemTester {
  constructor() {
    this.passengerToken = null;
    this.driverToken = null;
    this.passengerId = null;
    this.driverId = null;
    this.rideId = null;
    this.chatId = null;
    this.passengerSocket = null;
    this.driverSocket = null;
    this.rideTypeId = null;
    this.testResults = {
      auth: false,
      stateSync: false,
      rideFlow: false,
      chat: false,
      cleanup: false
    };
  }

  log(message, data = '') {
    console.log(`[${new Date().toISOString()}] ${message}`, data);
  }

  error(message, error = '') {
    console.error(`[${new Date().toISOString()}] ❌ ${message}`, error);
  }

  success(message, data = '') {
    console.log(`[${new Date().toISOString()}] ✅ ${message}`, data);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async request(method, path, data = null, token = null) {
    try {
      const config = {
        method,
        url: `${SERVER_URL}${path}`,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` })
        },
        ...(data && { data })
      };

      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`${error.response.status}: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  // === AUTHENTICATION TESTS ===

  async testAuthentication() {
    this.log('🔑 Testing authentication system...');

    try {
      // Test passenger authentication
      const passengerResponse = await this.request('POST', '/auth/login', TEST_PASSENGER);
      if (!passengerResponse.success || !passengerResponse.data.token) {
        throw new Error('Passenger authentication failed');
      }

      this.passengerToken = passengerResponse.data.token;
      this.passengerId = passengerResponse.data.user.id;
      this.success('Passenger authenticated', { userId: this.passengerId });

      // Test driver authentication
      const driverResponse = await this.request('POST', '/auth/login', TEST_DRIVER);
      if (!driverResponse.success || !driverResponse.data.token) {
        throw new Error('Driver authentication failed');
      }

      this.driverToken = driverResponse.data.token;
      this.driverId = driverResponse.data.user.id;
      this.success('Driver authenticated', { userId: this.driverId });

      this.testResults.auth = true;
      this.success('Authentication system test passed');

    } catch (error) {
      this.error('Authentication test failed', error.message);
      throw error;
    }
  }

  // === STATE SYNCHRONIZATION TESTS ===

  async testStateSynchronization() {
    this.log('🔄 Testing state synchronization...');

    try {
      // Test initial state check
      const passengerState = await this.request('GET', '/rides/sync/state', null, this.passengerToken);
      const driverState = await this.request('GET', '/rides/sync/state', null, this.driverToken);

      this.log('📊 Initial states:', {
        passenger: passengerState.data,
        driver: driverState.data
      });

      // Test cleanup if needed
      if (passengerState.data.hasActiveRide) {
        this.log('🧹 Cleaning up passenger orphaned rides...');
        const cleanupResult = await this.request('POST', '/rides/sync/cleanup', null, this.passengerToken);
        this.log('Cleanup result:', cleanupResult.data);
      }

      if (driverState.data.hasActiveRide) {
        this.log('🧹 Cleaning up driver orphaned rides...');
        const cleanupResult = await this.request('POST', '/rides/sync/cleanup', null, this.driverToken);
        this.log('Cleanup result:', cleanupResult.data);
      }

      // Verify clean state
      const finalPassengerState = await this.request('GET', '/rides/sync/state', null, this.passengerToken);
      const finalDriverState = await this.request('GET', '/rides/sync/state', null, this.driverToken);

      if (finalPassengerState.data.hasActiveRide || finalDriverState.data.hasActiveRide) {
        throw new Error('State cleanup failed');
      }

      this.testResults.stateSync = true;
      this.success('State synchronization test passed');

    } catch (error) {
      this.error('State synchronization test failed', error.message);
      throw error;
    }
  }

  // === WEBSOCKET TESTS ===

  async testWebSocketConnections() {
    this.log('🔌 Testing WebSocket connections...');

    try {
      // Setup passenger socket
      this.passengerSocket = io(SOCKET_URL, {
        auth: {
          token: this.passengerToken,
          userId: this.passengerId,
          userType: 'passenger'
        },
        transports: ['websocket', 'polling'],
        timeout: 5000
      });

      // Setup driver socket
      this.driverSocket = io(SOCKET_URL, {
        auth: {
          token: this.driverToken,
          userId: this.driverId,
          userType: 'driver'
        },
        transports: ['websocket', 'polling'],
        timeout: 5000
      });

      // Wait for connections
      await Promise.all([
        new Promise((resolve, reject) => {
          this.passengerSocket.on('connect', () => {
            this.success('Passenger socket connected');
            resolve();
          });
          this.passengerSocket.on('connect_error', reject);
        }),
        new Promise((resolve, reject) => {
          this.driverSocket.on('connect', () => {
            this.success('Driver socket connected');
            resolve();
          });
          this.driverSocket.on('connect_error', reject);
        })
      ]);

      // Setup event listeners for ride flow
      this.setupRideEventListeners();
      this.setupChatEventListeners();

      this.success('WebSocket connections established');

    } catch (error) {
      this.error('WebSocket connection test failed', error.message);
      throw error;
    }
  }

  setupRideEventListeners() {
    // Passenger events
    this.passengerSocket.on('ride:accepted', (data) => {
      this.success('Passenger received ride:accepted', { rideId: data.rideId });
    });

    this.passengerSocket.on('ride:started', (data) => {
      this.success('Passenger received ride:started', { rideId: data.rideId });
    });

    this.passengerSocket.on('ride:completed', (data) => {
      this.success('Passenger received ride:completed', { rideId: data.rideId });
    });

    // Driver events
    this.driverSocket.on('ride:new-request', (data) => {
      this.success('Driver received ride:new-request', { rideId: data.rideId });

      // Auto-accept the ride after 2 seconds
      setTimeout(() => {
        this.acceptRide(data.rideId);
      }, 2000);
    });

    this.driverSocket.on('ride:accepted', (data) => {
      this.success('Driver received ride:accepted confirmation', { rideId: data.rideId });
    });
  }

  setupChatEventListeners() {
    // Chat events for both users
    this.passengerSocket.on('chat:message', (data) => {
      this.success('Passenger received chat message', data);
    });

    this.driverSocket.on('chat:message', (data) => {
      this.success('Driver received chat message', data);
    });

    this.passengerSocket.on('chat:typing', (data) => {
      this.log('Passenger received typing indicator', data);
    });

    this.driverSocket.on('chat:typing', (data) => {
      this.log('Driver received typing indicator', data);
    });
  }

  // === RIDE FLOW TESTS ===

  async testCompleteRideFlow() {
    this.log('🚗 Testing complete ride flow...');

    try {
      // Get ride types
      const rideTypesResponse = await this.request('GET', '/ride-types', null, this.passengerToken);
      if (!rideTypesResponse.success || !rideTypesResponse.data.length) {
        throw new Error('No ride types available');
      }
      this.rideTypeId = rideTypesResponse.data[0].id;

      // Create ride request
      const rideData = {
        ...TEST_RIDE_DATA,
        rideTypeId: this.rideTypeId
      };

      const createResponse = await this.request('POST', '/rides', rideData, this.passengerToken);
      if (!createResponse.success) {
        throw new Error(`Failed to create ride: ${createResponse.message}`);
      }

      this.rideId = createResponse.data.id;
      this.success('Ride created', { rideId: this.rideId });

      // Join passenger to ride room
      this.passengerSocket.emit('ride:join', { rideId: this.rideId });

      // Wait for driver to accept (handled by event listener)
      await this.waitForRideAcceptance();

      // Start the ride
      await this.sleep(2000);
      await this.startRide();

      // Test chat during ride
      await this.testChatFunctionality();

      // Complete the ride
      await this.sleep(3000);
      await this.completeRide();

      // Verify final state
      await this.verifyRideCompletion();

      this.testResults.rideFlow = true;
      this.success('Complete ride flow test passed');

    } catch (error) {
      this.error('Ride flow test failed', error.message);
      throw error;
    }
  }

  async waitForRideAcceptance() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Ride acceptance timeout'));
      }, 15000);

      this.passengerSocket.on('ride:accepted', () => {
        clearTimeout(timeout);
        this.success('Ride acceptance confirmed');
        resolve();
      });
    });
  }

  async acceptRide(rideId) {
    this.log('✅ Driver accepting ride...', { rideId });

    try {
      const response = await this.request('POST', `/rides/${rideId}/accept`, {
        driverId: this.driverId
      }, this.driverToken);

      if (response.success) {
        this.success('Ride accepted successfully', response.data);
      } else {
        throw new Error('Failed to accept ride');
      }
    } catch (error) {
      this.error('Failed to accept ride', error.message);
      throw error;
    }
  }

  async startRide() {
    this.log('🚀 Driver starting ride...');

    try {
      const response = await this.request('POST', `/rides/${this.rideId}/start`, {}, this.driverToken);

      if (response.success) {
        this.success('Ride started successfully', response.data);
      } else {
        throw new Error('Failed to start ride');
      }
    } catch (error) {
      this.error('Failed to start ride', error.message);
      throw error;
    }
  }

  async completeRide() {
    this.log('🏁 Driver completing ride...');

    try {
      const response = await this.request('POST', `/rides/${this.rideId}/complete`, {}, this.driverToken);

      if (response.success) {
        this.success('Ride completed successfully', response.data);
      } else {
        throw new Error('Failed to complete ride');
      }
    } catch (error) {
      this.error('Failed to complete ride', error.message);
      throw error;
    }
  }

  // === CHAT TESTS ===

  async testChatFunctionality() {
    this.log('💬 Testing chat functionality...');

    try {
      // Get or create chat for the ride
      const chatResponse = await this.request('GET', `/chat/ride/${this.rideId}`, null, this.passengerToken);

      if (!chatResponse.success) {
        throw new Error('Failed to get chat for ride');
      }

      this.chatId = chatResponse.data.id;
      this.success('Chat created/retrieved', { chatId: this.chatId });

      // Join chat rooms
      this.passengerSocket.emit('chat:join', { chatId: this.chatId });
      this.driverSocket.emit('chat:join', { chatId: this.chatId });

      await this.sleep(1000);

      // Test sending messages
      await this.testChatMessages();

      // Test typing indicators
      await this.testTypingIndicators();

      this.testResults.chat = true;
      this.success('Chat functionality test passed');

    } catch (error) {
      this.error('Chat functionality test failed', error.message);
      throw error;
    }
  }

  async testChatMessages() {
    this.log('📝 Testing chat messages...');

    try {
      // Passenger sends message
      const passengerMessage = {
        content: 'Olá, estou aguardando no local combinado!',
        type: 'TEXT'
      };

      const messageResponse1 = await this.request('POST', `/chat/${this.chatId}/messages`, passengerMessage, this.passengerToken);

      if (!messageResponse1.success) {
        throw new Error('Failed to send passenger message');
      }

      this.success('Passenger message sent');

      await this.sleep(1000);

      // Driver sends message
      const driverMessage = {
        content: 'Perfeito! Estou chegando em 2 minutos.',
        type: 'TEXT'
      };

      const messageResponse2 = await this.request('POST', `/chat/${this.chatId}/messages`, driverMessage, this.driverToken);

      if (!messageResponse2.success) {
        throw new Error('Failed to send driver message');
      }

      this.success('Driver message sent');

      // Verify messages were stored
      const messagesResponse = await this.request('GET', `/chat/${this.chatId}/messages`, null, this.passengerToken);

      if (!messagesResponse.success || messagesResponse.data.length < 2) {
        throw new Error('Messages not properly stored');
      }

      this.success('Chat messages verified', { messageCount: messagesResponse.data.length });

    } catch (error) {
      this.error('Chat messages test failed', error.message);
      throw error;
    }
  }

  async testTypingIndicators() {
    this.log('⌨️ Testing typing indicators...');

    try {
      // Passenger starts typing
      this.passengerSocket.emit('chat:typing', { chatId: this.chatId, isTyping: true });

      await this.sleep(500);

      // Passenger stops typing
      this.passengerSocket.emit('chat:typing', { chatId: this.chatId, isTyping: false });

      this.success('Typing indicators tested');

    } catch (error) {
      this.error('Typing indicators test failed', error.message);
      throw error;
    }
  }

  // === VERIFICATION TESTS ===

  async verifyRideCompletion() {
    this.log('🔍 Verifying ride completion...');

    try {
      await this.sleep(2000); // Allow for state updates

      // Check final states
      const passengerState = await this.request('GET', '/rides/sync/state', null, this.passengerToken);
      const driverState = await this.request('GET', '/rides/sync/state', null, this.driverToken);

      this.log('📊 Final states:', {
        passenger: passengerState.data,
        driver: driverState.data
      });

      // Verify states are clean
      if (passengerState.data.hasActiveRide) {
        this.error('Passenger still has active ride after completion');
        return false;
      }

      if (driverState.data.hasActiveRide) {
        this.error('Driver still has active ride after completion');
        return false;
      }

      // Verify ride status in database
      const rideResponse = await this.request('GET', `/rides/${this.rideId}`, null, this.passengerToken);

      if (!rideResponse.success || rideResponse.data.status !== 'COMPLETED') {
        throw new Error('Ride status not properly updated');
      }

      this.testResults.cleanup = true;
      this.success('Ride completion verification passed');
      return true;

    } catch (error) {
      this.error('Ride completion verification failed', error.message);
      throw error;
    }
  }

  // === CLEANUP ===

  cleanup() {
    this.log('🧹 Cleaning up test connections...');

    if (this.passengerSocket) {
      this.passengerSocket.disconnect();
    }

    if (this.driverSocket) {
      this.driverSocket.disconnect();
    }
  }

  // === MAIN TEST RUNNER ===

  async run() {
    try {
      this.log('🚀 Starting Complete System Test Suite');
      this.log('=====================================');

      // Run all test phases
      await this.testAuthentication();
      await this.testStateSynchronization();
      await this.testWebSocketConnections();
      await this.testCompleteRideFlow();

      // Final verification
      this.log('📋 Test Results Summary:');
      Object.entries(this.testResults).forEach(([test, passed]) => {
        this.log(`  ${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSED' : 'FAILED'}`);
      });

      const allPassed = Object.values(this.testResults).every(result => result);

      if (allPassed) {
        this.success('🎉 ALL TESTS PASSED! System is production-ready.');
      } else {
        this.error('❌ Some tests failed. System needs attention.');
        process.exit(1);
      }

    } catch (error) {
      this.error('Test suite failed', error.message);
      process.exit(1);
    } finally {
      this.cleanup();
      process.exit(0);
    }
  }
}

// Run the complete test suite
const tester = new CompleteSystemTester();
tester.run();