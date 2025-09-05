# Step-by-Step Execution Guide for overForge Platform

This guide will help you set up and run the platform locally using the free/open-source stack described in `techstack.md`.

---

## Prerequisites

- **Node.js** (v16+ recommended)
- **npm** or **yarn**
- **Python** (3.8+)
- **Docker** (for Judge0 CE)
- **PostgreSQL** or **MySQL** (local or Docker)
- **Git**

---

## 1. Clone the Repository

```bash
git clone <your-repo-url>
cd <project-root>
```

---

## 2. Setup the Database

- Install and start PostgreSQL or MySQL.
- Create a database for the project.
- Update the backend config with your DB credentials.

---

## 3. Start the Backend Server

```bash
cd backend
npm install
npm run dev
```
- The backend will run on `http://localhost:5000` by default.

---

## 4. Start the Frontend

```bash
cd frontend
npm install
npm start
```
- The frontend will run on `http://localhost:3000` by default.

---

## 5. Start the AI Analysis Module

```bash
cd ai_module
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```
- The AI module will run on `http://localhost:8000` by default.

---

## 6. Start Judge0 CE (Code Execution System)

- Make sure Docker is running.
- From the project root:

```bash
docker-compose -f judge0/docker-compose.yml up -d
```
- Judge0 API will be available at `http://localhost:2358` by default.

---

## 7. (Optional) Start STUN/TURN Server for WebRTC

- For local testing, you may use public STUN servers.
- For production, deploy [coturn](https://github.com/coturn/coturn).

---

## 8. Environment Variables

- Copy `.env.example` files in each service to `.env` and fill in the required values.

---

## 9. Access the Platform

- Open `http://localhost:3000` in your browser.
- Register/login, create/join a room, and start collaborating!

---

## 10. Troubleshooting

- Check logs in each service directory for errors.
- Ensure all services are running and accessible on their respective ports.

---

## 11. Useful Commands

- Stop all Docker containers:
  ```bash
  docker-compose -f judge0/docker-compose.yml down
  ```
- Restart backend/frontend/AI module as needed.

---

## 12. Next Steps

- See `techstack.md` for upgrade paths and advanced configuration.
- Contribute by opening issues or PRs! 