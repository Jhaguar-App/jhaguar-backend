export function getAllowedOrigins(): string[] | boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const origins = [
    'https://jhaguar.com',
    'https://www.jhaguar.com',
    'https://jhaguar.com.br',
    'https://www.jhaguar.com.br',
    process.env.FRONTEND_URL,
    process.env.MOBILE_APP_URL,
  ].filter(Boolean) as string[];

  return origins;
}

export function getHttpCorsConfig() {
  return {
    origin: getAllowedOrigins(),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type,Authorization,Accept,Origin,X-Requested-With',
  };
}

export function getWebSocketCorsConfig() {
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins === true) {
    return { origin: '*' };
  }

  return {
    origin: allowedOrigins,
    credentials: true,
  };
}
