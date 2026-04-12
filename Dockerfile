# ==================================
# Build timestamp: 2025-11-12 - Production Ready
# ==================================
FROM node:20-alpine AS builder

# Instalar dependências do sistema necessárias para Prisma e build
RUN apk add --no-cache openssl openssl-dev bash

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
RUN apk add --no-cache openssl bash postgresql-client

# Variável de ambiente
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar APENAS dependências de produção
RUN npm ci --only=production && npm cache clean --force

# Copiar Prisma schema e migrations (necessário para runtime)
COPY prisma ./prisma/

# Copiar scripts auxiliares
COPY scripts ./scripts/

# Gerar Prisma Client na imagem final
RUN npx prisma generate

# Copiar código compilado da etapa builder
COPY --from=builder /usr/src/app/dist ./dist

# Copiar arquivos estáticos (HTML, CSS, etc.)
COPY --from=builder /usr/src/app/public ./public

# Expor porta
EXPOSE 3000

# Healthcheck melhorado
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Script de inicialização robusto
RUN echo '#!/bin/bash' > /start.sh && \
    echo 'set -e' >> /start.sh && \
    echo '' >> /start.sh && \
    echo 'echo "╔════════════════════════════════════════════════════════╗"' >> /start.sh && \
    echo 'echo "║        🐆 JHAGUAR BACKEND - STARTING UP 🐆            ║"' >> /start.sh && \
    echo 'echo "╚════════════════════════════════════════════════════════╝"' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Verificar variáveis de ambiente críticas' >> /start.sh && \
    echo 'if [ -z "$DATABASE_URL" ]; then' >> /start.sh && \
    echo '  echo "❌ ERRO: DATABASE_URL não está definida!"' >> /start.sh && \
    echo '  exit 1' >> /start.sh && \
    echo 'fi' >> /start.sh && \
    echo '' >> /start.sh && \
    echo 'echo "📍 Ambiente: $NODE_ENV"' >> /start.sh && \
    echo 'echo "🔌 Porta: ${PORT:-3000}"' >> /start.sh && \
    echo 'echo "🗄️  Banco de dados configurado"' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Executar script de verificação e migrations' >> /start.sh && \
    echo 'echo ""' >> /start.sh && \
    echo 'if [ -f "scripts/check-and-migrate.js" ]; then' >> /start.sh && \
    echo '  echo "🔧 Executando verificação de migrations..."' >> /start.sh && \
    echo '  node scripts/check-and-migrate.js' >> /start.sh && \
    echo '  MIGRATION_EXIT_CODE=$?' >> /start.sh && \
    echo '  if [ $MIGRATION_EXIT_CODE -ne 0 ]; then' >> /start.sh && \
    echo '    echo "❌ ERRO: Falha ao aplicar migrations!"' >> /start.sh && \
    echo '    exit $MIGRATION_EXIT_CODE' >> /start.sh && \
    echo '  fi' >> /start.sh && \
    echo 'else' >> /start.sh && \
    echo '  echo "⚠️  Script de migrations não encontrado, usando método padrão..."' >> /start.sh && \
    echo '  echo "🔄 Aplicando migrations..."' >> /start.sh && \
    echo '  npx prisma migrate deploy || {' >> /start.sh && \
    echo '    echo "❌ ERRO: Falha ao aplicar migrations!"' >> /start.sh && \
    echo '    exit 1' >> /start.sh && \
    echo '  }' >> /start.sh && \
    echo 'fi' >> /start.sh && \
    echo '' >> /start.sh && \
    echo 'echo ""' >> /start.sh && \
    echo 'echo "╔════════════════════════════════════════════════════════╗"' >> /start.sh && \
    echo 'echo "║           🚀 INICIANDO APLICAÇÃO... 🚀                ║"' >> /start.sh && \
    echo 'echo "╚════════════════════════════════════════════════════════╝"' >> /start.sh && \
    echo 'echo ""' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Iniciar aplicação' >> /start.sh && \
    echo 'exec node dist/main' >> /start.sh && \
    chmod +x /start.sh

CMD ["/start.sh"]