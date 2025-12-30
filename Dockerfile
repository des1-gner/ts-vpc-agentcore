FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY dist ./dist

EXPOSE 8080

CMD ["node", "dist/index.js"]
