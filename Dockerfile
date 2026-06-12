# WBboard: app и worker из одного образа
# BASE через mirror.gcr.io — Docker Hub лимитит pull с RU VPS
ARG BASE=node:22-alpine
FROM ${BASE}
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
