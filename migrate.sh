#!/bin/bash
set -e

echo "🔄 Executando migrations..."
npx prisma migrate deploy

echo "✅ Migrations concluídas!"
echo ""
echo "📊 Verificando tabelas criadas:"
psql $DATABASE_URL -c "\dt public.*subscription*"
