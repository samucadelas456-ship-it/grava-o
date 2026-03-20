# Usar imagem oficial do Node.js (já vem com npm instalado)
FROM node:18-slim

# Instalar ffmpeg e dependências necessárias
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências do Node.js
RUN npm install

# Copiar o resto dos arquivos
COPY . .

# Criar diretório para gravações
RUN mkdir -p recordings

# Comando para iniciar o bot
CMD ["node", "index.js"]
