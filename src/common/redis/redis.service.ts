import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private redis: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    let redisConfig;

    this.logger.log('🔧 Initializing Redis connection...');
    this.logger.debug(`REDIS_URL exists: ${!!redisUrl}`);

    if (redisUrl) {
      try {
        this.logger.debug(`Raw REDIS_URL length: ${redisUrl.length} chars`);

        const url = new URL(redisUrl.trim());

        redisConfig = {
          host: url.hostname,
          port: parseInt(url.port) || 6379,
          password: url.password || undefined,
          username:
            url.username && url.username !== 'default'
              ? url.username
              : undefined,
          db: 0,
          lazyConnect: false,
          enableReadyCheck: true,
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            this.logger.debug(
              `Redis retry attempt ${times}, delay: ${delay}ms`,
            );
            return delay;
          },
        };

        this.logger.log(
          `✅ Parsed Redis config: ${url.hostname}:${url.port || 6379} (db: 0)`,
        );
      } catch (error) {
        this.logger.error(`❌ Error parsing REDIS_URL: ${error.message}`);
        redisConfig = {
          host: 'localhost',
          port: 6379,
          db: 0,
        };
      }
    } else {
      this.logger.warn('⚠️ REDIS_URL not found, using fallback config');
      redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: 0,
        lazyConnect: true,
      };
    }

    this.redis = new Redis(redisConfig);

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      this.logger.error(`Error getting key from Redis: ${error.message}`);
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.redis.setex(key, ttl, value);
      } else {
        await this.redis.set(key, value);
      }
    } catch (error) {
      this.logger.error(`Error setting key in Redis: ${error.message}`);
    }
  }

  async setPX(key: string, value: string, ttlMs: number): Promise<'OK' | null> {
    try {
      return await this.redis.set(key, value, 'PX', ttlMs);
    } catch (error) {
      this.logger.error(`Error setting key with PX in Redis: ${error.message}`);
      return null;
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Error deleting key from Redis: ${error.message}`);
      return 0;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      return await this.redis.incr(key);
    } catch (error) {
      this.logger.error(`Error incrementing key in Redis: ${error.message}`);
      return 0;
    }
  }

  async expire(key: string, ttl: number): Promise<number> {
    try {
      return await this.redis.expire(key, ttl);
    } catch (error) {
      this.logger.error(
        `Error setting expiry for key in Redis: ${error.message}`,
      );
      return 0;
    }
  }

  async setDriverLocation(
    driverId: string,
    locationData: {
      latitude: number;
      longitude: number;
      isOnline: boolean;
      isAvailable: boolean;
      heading?: number;
      speed?: number;
      accuracy?: number;
      updatedAt: Date;
    },
  ): Promise<void> {
    const key = `driver_location:${driverId}`;
    const ttl = 30; // 30 seconds TTL

    try {
      await this.redis.setex(key, ttl, JSON.stringify(locationData));
    } catch (error) {
      this.logger.error(
        `Error setting driver location in Redis: ${error.message}`,
      );
    }
  }

  async getDriverLocation(driverId: string): Promise<any | null> {
    const key = `driver_location:${driverId}`;

    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(
        `Error getting driver location from Redis: ${error.message}`,
      );
      return null;
    }
  }

  async setOnlineDriversInRegion(
    lat: number,
    lng: number,
    radius: number,
    driverIds: string[],
  ): Promise<void> {
    const key = `online_drivers:${lat}:${lng}:${radius}`;
    const ttl = 10; // 10 seconds TTL

    try {
      await this.redis.setex(key, ttl, JSON.stringify(driverIds));
    } catch (error) {
      this.logger.error(
        `Error setting online drivers in Redis: ${error.message}`,
      );
    }
  }

  async getOnlineDriversInRegion(
    lat: number,
    lng: number,
    radius: number,
  ): Promise<string[] | null> {
    const key = `online_drivers:${lat}:${lng}:${radius}`;

    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(
        `Error getting online drivers from Redis: ${error.message}`,
      );
      return null;
    }
  }

  async setActiveRide(rideId: string, rideData: any): Promise<void> {
    const key = `active_ride:${rideId}`;
    const ttl = 24 * 60 * 60; // 24 hours TTL

    try {
      await this.redis.setex(key, ttl, JSON.stringify(rideData));
    } catch (error) {
      this.logger.error(`Error setting active ride in Redis: ${error.message}`);
    }
  }

  async getActiveRide(rideId: string): Promise<any | null> {
    const key = `active_ride:${rideId}`;

    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(
        `Error getting active ride from Redis: ${error.message}`,
      );
      return null;
    }
  }

  async deleteActiveRide(rideId: string): Promise<void> {
    const key = `active_ride:${rideId}`;

    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(
        `Error deleting active ride from Redis: ${error.message}`,
      );
    }
  }

  async incrementDriverLocationUpdates(driverId: string): Promise<number> {
    const key = `driver_location_updates:${driverId}`;
    const ttl = 1;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, ttl);
      }
      return count;
    } catch (error) {
      this.logger.error(
        `Error incrementing location updates: ${error.message}`,
      );
      return 0;
    }
  }

  async deleteByPattern(pattern: string): Promise<number> {
    let deletedCount = 0;
    const stream = this.redis.scanStream({
      match: pattern,
      count: 100,
    });

    try {
      for await (const keys of stream) {
        if (keys.length > 0) {
          const result = await this.redis.del(...keys);
          deletedCount += result;
        }
      }
      this.logger.debug(
        `Deleted ${deletedCount} keys matching pattern: ${pattern}`,
      );
    } catch (error) {
      this.logger.error(
        `Error deleting keys by pattern ${pattern}: ${error.message}`,
      );
    }

    return deletedCount;
  }

  async onModuleDestroy() {
    await this.redis.disconnect();
  }
}
