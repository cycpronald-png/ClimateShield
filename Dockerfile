# Frontend development container for ClimateShield
FROM node:20-alpine

WORKDIR /app

# Install dependencies (package-lock.json is optional)
COPY package.json ./
RUN npm install

# Copy source code (volume mount overrides this in dev)
COPY . .

EXPOSE 5173

ENV CHOKIDAR_USEPOLLING=true
ENV BACKEND_URL=http://backend:8000

CMD ["npm", "run", "dev", "--", "--host"]
