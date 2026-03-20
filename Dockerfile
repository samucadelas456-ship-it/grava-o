FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# EXPOR a porta (importante para o Railway)
EXPOSE 3000

CMD ["node", "index.js"]
