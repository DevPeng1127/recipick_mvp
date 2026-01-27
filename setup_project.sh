#!/bin/bash

# Create directories
mkdir -p backend/src/main/java/com/recipick/api
mkdir -p backend/src/main/resources
mkdir -p frontend/src
mkdir -p frontend/public

# Root: docker-compose.yml
cat > docker-compose.yml <<EOF
version: '3.8'
services:
  db:
    image: postgres:16
    container_name: recipick-db
    environment:
      POSTGRES_DB: recipick
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - db_data:/var/lib/postgresql/data

volumes:
  db_data:
EOF

# Root: .gitignore
cat > .gitignore <<EOF
# Java
target/
*.class
.gradle/
build/

# Node
node_modules/
dist/
.env

# OS
.DS_Store
Thumbs.db

# IDE
.idea/
*.iml
.vscode/
EOF

# Root: README.md
cat > README.md <<EOF
# Recipick MVP

## Tech Stack
- **Backend**: Java 21, Spring Boot 3, Gradle
- **Frontend**: React, Vite, TypeScript, Tailwind CSS, Zustand
- **Infra**: Docker Compose (PostgreSQL)

## How to Run

### 1. Database
\`\`\`bash
docker-compose up -d
\`\`\`

### 2. Backend
\`\`\`bash
cd backend
# If gradlew is not present, run 'gradle wrapper' first or use installed gradle
gradle bootRun
\`\`\`

### 3. Frontend
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`
EOF

# Backend: build.gradle
cat > backend/build.gradle <<EOF
plugins {
    id 'java'
    id 'org.springframework.boot' version '3.2.2'
    id 'io.spring.dependency-management' version '1.1.4'
}

group = 'com.recipick'
version = '0.0.1-SNAPSHOT'

java {
    sourceCompatibility = '21'
}

configurations {
    compileOnly {
        extendsFrom annotationProcessor
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation 'org.springframework.boot:spring-boot-starter-validation'
    implementation 'org.springframework.boot:spring-boot-starter-web'
    compileOnly 'org.projectlombok:lombok'
    runtimeOnly 'org.postgresql:postgresql'
    annotationProcessor 'org.projectlombok:lombok'
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
}

tasks.named('test') {
    useJUnitPlatform()
}
EOF

# Backend: settings.gradle
cat > backend/settings.gradle <<EOF
rootProject.name = 'recipick-backend'
EOF

# Backend: Application Class
cat > backend/src/main/java/com/recipick/api/RecipickApplication.java <<EOF
package com.recipick.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class RecipickApplication {
    public static void main(String[] args) {
        SpringApplication.run(RecipickApplication.class, args);
    }
}
EOF

# Backend: application.yml
cat > backend/src/main/resources/application.yml <<EOF
spring:
  application:
    name: recipick-backend
  datasource:
    url: jdbc:postgresql://localhost:5432/recipick
    username: user
    password: password
    driver-class-name: org.postgresql.Driver
  jpa:
    hibernate:
      ddl-auto: update
    show-sql: true
    properties:
      hibernate:
        format_sql: true
EOF

# Frontend: package.json
cat > frontend/package.json <<EOF
{
  "name": "recipick-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.6.7",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.55",
    "@types/react-dom": "^18.2.19",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.2.2",
    "vite": "^5.1.0"
  }
}
EOF

# Frontend: tsconfig.json
cat > frontend/tsconfig.json <<EOF
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
EOF

# Frontend: tsconfig.node.json
cat > frontend/tsconfig.node.json <<EOF
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
EOF

# Frontend: vite.config.ts
cat > frontend/vite.config.ts <<EOF
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})
EOF

# Frontend: tailwind.config.js
cat > frontend/tailwind.config.js <<EOF
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
EOF

# Frontend: postcss.config.js
cat > frontend/postcss.config.js <<EOF
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

# Frontend: index.html
cat > frontend/index.html <<EOF
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Recipick</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

# Frontend: src/index.css
cat > frontend/src/index.css <<EOF
@tailwind base;
@tailwind components;
@tailwind utilities;
EOF

# Frontend: src/main.tsx
cat > frontend/src/main.tsx <<EOF
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
EOF

# Frontend: src/App.tsx
cat > frontend/src/App.tsx <<EOF
import { useState } from 'react'

function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <h1 className="text-3xl font-bold text-blue-600">
        Recipick MVP Setup Complete!
      </h1>
    </div>
  )
}

export default App
EOF

echo "Project setup complete!"
