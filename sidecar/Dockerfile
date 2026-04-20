FROM node:20-bullseye
RUN apt-get update && apt-get install -y \
  libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
  libcairo2 libx11-6 libxext6 libxrender1 fonts-liberation \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
EXPOSE 3002
CMD ["node", "index.js"]
