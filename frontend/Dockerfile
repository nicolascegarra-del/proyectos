FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Imagen nginx sin privilegios: corre como usuario no-root (uid 101) y escucha
# en 8080 (puerto no privilegiado). El proxy de Coolify/Traefik detecta el puerto
# expuesto automáticamente.
FROM nginxinc/nginx-unprivileged:alpine
USER root
RUN apk add --no-cache curl
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
USER nginx

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
