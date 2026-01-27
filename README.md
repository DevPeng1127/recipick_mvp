# Recipick MVP

## Tech Stack
- **Backend**: Java 21, Spring Boot 3, Gradle
- **Frontend**: React, Vite, TypeScript, Tailwind CSS, Zustand
- **Infra**: Docker Compose (PostgreSQL)

## How to Run

### 1. Database
```bash
docker-compose up -d
```

### 2. Backend
```bash
cd backend
# If gradlew is not present, run 'gradle wrapper' first or use installed gradle
gradle bootRun
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
