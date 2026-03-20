# Usar imagem oficial do Node.js
FROM node:18-slim

# Instalar dependências do sistema incluindo ffmpeg e npm
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório da aplicação
WORKDIR /app

# Copiar apenas os arquivos de dependências primeiro (para cache)
COPY package*.json ./

# Instalar dependências do Node (npm já está disponível na imagem node:18-slim)
RUN npm ci --only=production || npm install

# Copiar o resto do código
COPY . .

# Criar diretório para gravações com permissões corretas
RUN mkdir -p recordings && chmod 777 recordings

# Expor porta (não necessária para bot, mas útil para health check)
EXPOSE 3000

# Comando para iniciar o bot
CMD ["node", "index.js"]
