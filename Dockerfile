
FROM node:20-alpine AS builder

# Instalar dependências do sistema necessárias para Prisma e build
RUN apk add --no-cache openssl openssl-dev

WORKDIR /usr/src/app

# Copiar arquivos de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instalar TODAS as dependências (incluindo devDependencies para build)
RUN npm ci

# Gerar Prisma Client
RUN npx prisma generate

# Copiar código fonte
COPY . .

# Compilar aplicação TypeScript → JavaScript
RUN npm run build

# ==================================
# Etapa 2: Production (imagem final)
# ==================================
FROM node:20-alpine AS production

# Instalar dependências do sistema para Prisma em runtime
RUN apk add --no-cache openssl

# Variável de ambiente
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar APENAS dependências de produção
RUN npm ci --only=production && npm cache clean --force

# Copiar Prisma schema (necessário para runtime)
COPY prisma ./prisma/

# Gerar Prisma Client na imagem final
RUN npx prisma generate

# Copiar código compilado da etapa builder
COPY --from=builder /usr/src/app/dist ./dist

# Expor porta
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

RUN echo '#!/bin/sh' > /start.sh && \
    echo 'echo "🔄 Running database migrations..."' >> /start.sh && \
    echo 'npx prisma migrate deploy' >> /start.sh && \
    echo 'echo "✅ Migrations completed"' >> /start.sh && \
    echo 'echo "🚀 Starting application..."' >> /start.sh && \
    echo 'node dist/main' >> /start.sh && \
    chmod +x /start.sh

CMD ["/start.sh"]