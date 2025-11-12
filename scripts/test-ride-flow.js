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

class RideFlowTester {
  constructor() {
    this.passengerToken = null;
    this.driverToken = null;
    this.passengerId = null;
    this.driverId = null;
    this.rideId = null;
    this.passengerSocket = null;
    this.driverSocket = null;
    this.rideTypeId = null;
  }

  log(message, data = '') {
    console.log(`[${new Date().toISOString()}] ${message}`, data);
  }

  error(message, error = '') {
    console.error(`[${new Date().toISOString()}] ❌ ${message}`, error);
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

  async authenticatePassenger() {
    this.log('🔑 Authenticating passenger...');

    const response = await this.request('POST', '/auth/login', TEST_PASSENGER);

    if (!response.success || !response.data.token) {
      throw new Error('Failed to authenticate passenger');
    }

    this.passengerToken = response.data.token;
    this.passengerId = response.data.user.id;
    this.log('✅ Passenger authenticated', { userId: this.passengerId });
  }

  async authenticateDriver() {
    this.log('🔑 Authenticating driver...');

    const response = await this.request('POST', '/auth/login', TEST_DRIVER);

    if (!response.success || !response.data.token) {
      throw new Error('Failed to authenticate driver');
    }

    this.driverToken = response.data.token;
    this.driverId = response.data.user.id;
    this.log('✅ Driver authenticated', { userId: this.driverId });
  }

  async getRideTypes() {
    this.log('📋 Getting ride types...');

    const response = await this.request('GET', '/ride-types', null, this.passengerToken);

    if (!response.success || !response.data.length) {
      throw new Error('No ride types available');
    }

    this.rideTypeId = response.data[0].id;
    this.log('✅ Got ride types', { selectedType: this.rideTypeId });
  }

  async checkInitialState() {
    this.log('🔍 Checking initial ride state...');

    // Check passenger state
    const passengerState = await this.request('GET', '/rides/sync/state', null, this.passengerToken);
    this.log('📊 Passenger state:', passengerState.data);

    // Check driver state
    const driverState = await this.request('GET', '/rides/sync/state', null, this.driverToken);
    this.log('📊 Driver state:', driverState.data);

    // Cleanup any orphaned rides
    if (passengerState.data.hasActiveRide) {
      this.log('🧹 Cleaning up passenger orphaned rides...');
      await this.request('POST', '/rides/sync/cleanup', null, this.passengerToken);
    }

    if (driverState.data.hasActiveRide) {
      this.log('🧹 Cleaning up driver orphaned rides...');
      await this.request('POST', '/rides/sync/cleanup', null, this.driverToken);
    }
  }

  async setupWebSockets() {
    this.log('🔌 Setting up WebSocket connections...');

    // Passenger socket
    this.passengerSocket = io(SOCKET_URL, {
      auth: {
        token: this.passengerToken,
        userId: this.passengerId,
        userType: 'passenger'
      }
    });

    // Driver socket
    this.driverSocket = io(SOCKET_URL, {
      auth: {
        token: this.driverToken,
        userId: this.driverId,
        userType: 'driver'
      }
    });

    // Wait for connections
    await Promise.all([
      new Promise((resolve) => {
        this.passengerSocket.on('connect', () => {
          this.log('✅ Passenger socket connected');
          resolve();
        });
      }),
      new Promise((resolve) => {
        this.driverSocket.on('connect', () => {
          this.log('✅ Driver socket connected');
          resolve();
        });
      })
    ]);

    // Setup event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Passenger events
    this.passengerSocket.on('ride:accepted', (data) => {
      this.log('🚗 Passenger received ride:accepted', data);
    });

    this.passengerSocket.on('ride:started', (data) => {
      this.log('🚀 Passenger received ride:started', data);
    });

    this.passengerSocket.on('ride:completed', (data) => {
      this.log('🏁 Passenger received ride:completed', data);
    });

    // Driver events
    this.driverSocket.on('ride:new-request', (data) => {
      this.log('📨 Driver received ride:new-request', data);

      // Auto-accept the ride
      setTimeout(() => {
        this.acceptRide(data.rideId);
      }, 2000);
    });

    this.driverSocket.on('ride:accepted', (data) => {
      this.log('✅ Driver received ride:accepted', data);
    });
  }

  async createRide() {
    this.log('🚗 Creating ride request...');

    const rideData = {
      ...TEST_RIDE_DATA,
      rideTypeId: this.rideTypeId
    };

    const response = await this.request('POST', '/rides', rideData, this.passengerToken);

    if (!response.success) {
      throw new Error(`Failed to create ride: ${response.message}`);
    }

    this.rideId = response.data.id;
    this.log('✅ Ride created', { rideId: this.rideId, status: response.data.status });

    // Join passenger to ride room
    this.passengerSocket.emit('ride:join', { rideId: this.rideId });
  }

  async acceptRide(rideId) {
    this.log('✅ Driver accepting ride...', { rideId });

    try {
      const response = await this.request('POST', `/rides/${rideId}/accept`, {
        driverId: this.driverId
      }, this.driverToken);

      if (response.success) {
        this.log('✅ Ride accepted successfully', response.data);

        // Start the ride after 3 seconds
        setTimeout(() => {
          this.startRide();
        }, 3000);
      }
    } catch (error) {
      this.error('Failed to accept ride', error.message);
    }
  }

  async startRide() {
    this.log('🚀 Driver starting ride...');

    try {
      const response = await this.request('POST', `/rides/${this.rideId}/start`, {}, this.driverToken);

      if (response.success) {
        this.log('✅ Ride started successfully', response.data);

        // Complete the ride after 5 seconds
        setTimeout(() => {
          this.completeRide();
        }, 5000);
      }
    } catch (error) {
      this.error('Failed to start ride', error.message);
    }
  }

  async completeRide() {
    this.log('🏁 Driver completing ride...');

    try {
      const response = await this.request('POST', `/rides/${this.rideId}/complete`, {}, this.driverToken);

      if (response.success) {
        this.log('✅ Ride completed successfully', response.data);

        // Validate final state
        setTimeout(() => {
          this.validateFinalState();
        }, 2000);
      }
    } catch (error) {
      this.error('Failed to complete ride', error.message);
    }
  }

  async validateFinalState() {
    this.log('🔍 Validating final state...');

    try {
      // Check passenger final state
      const passengerState = await this.request('GET', '/rides/sync/state', null, this.passengerToken);
      this.log('📊 Final passenger state:', passengerState.data);

      // Check driver final state
      const driverState = await this.request('GET', '/rides/sync/state', null, this.driverToken);
      this.log('📊 Final driver state:', driverState.data);

      // Validate expectations
      if (passengerState.data.hasActiveRide) {
        this.error('Passenger still has active ride after completion');
      } else {
        this.log('✅ Passenger state cleaned up correctly');
      }

      if (driverState.data.hasActiveRide) {
        this.error('Driver still has active ride after completion');
      } else {
        this.log('✅ Driver state cleaned up correctly');
      }

      this.log('🎉 Ride flow test completed successfully!');

    } catch (error) {
      this.error('Final state validation failed', error.message);
    } finally {
      this.cleanup();
    }
  }

  cleanup() {
    this.log('🧹 Cleaning up connections...');

    if (this.passengerSocket) {
      this.passengerSocket.disconnect();
    }

    if (this.driverSocket) {
      this.driverSocket.disconnect();
    }

    process.exit(0);
  }

  async run() {
    try {
      this.log('🚀 Starting complete ride flow test...');

      // Phase 1: Authentication
      await this.authenticatePassenger();
      await this.authenticateDriver();

      // Phase 2: Setup
      await this.getRideTypes();
      await this.checkInitialState();
      await this.setupWebSockets();

      // Phase 3: Ride flow
      await this.sleep(2000); // Allow WebSocket connections to stabilize
      await this.createRide();

      // The rest of the flow is event-driven
      // Set a timeout to ensure test doesn't hang
      setTimeout(() => {
        this.error('Test timed out after 30 seconds');
        this.cleanup();
      }, 30000);

    } catch (error) {
      this.error('Test failed', error.message);
      this.cleanup();
    }
  }
}

// Run the test
const tester = new RideFlowTester();
tester.run();