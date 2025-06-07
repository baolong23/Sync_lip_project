# Install dependencies only when needed
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install
RUN npm install -g next

COPY . .
RUN npm run build

# # Copy built assets and node_modules
# COPY --from=builder /app/.next ./.next
# COPY --from=builder /app/public ./public
# COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["npm", "run", "dev"]
