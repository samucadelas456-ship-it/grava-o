FROM node:18-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar apenas package.json primeiro (melhor para cache)
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar o resto do código
COPY . .

# Criar diretório para gravações
RUN mkdir -p recordings

# Comando correto para iniciar
CMD ["npm", "start"]
