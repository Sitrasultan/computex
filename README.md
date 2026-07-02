# 💻 ComputeX - Distributed Remote Computing Platform

> Transforming idle campus computers into an on-demand remote computing infrastructure for students.

![License](https://img.shields.io/badge/Status-Prototype-blue)
![React](https://img.shields.io/badge/Frontend-React-61DAFB)
![Node.js](https://img.shields.io/badge/Backend-Node.js-339933)
![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248)
![Python](https://img.shields.io/badge/Host%20Agent-Python-3776AB)

---

# 📖 Overview

**ComputeX** is a distributed remote computing platform developed as a Final Year Project (FYP) to provide students with secure, on-demand access to university laboratory computers from any smart device.

Instead of requiring students to be physically present in computer laboratories, ComputeX transforms idle campus computers into managed remote hosts. Through a centralized coordinator server, authenticated users can start isolated computing sessions, perform academic work remotely, and end sessions securely while the system automatically manages resource allocation and usage accounting.

The platform aims to improve accessibility, maximize utilization of institutional computing resources, and provide an equitable computing environment for students.

---

# 🎯 Problem Statement

Many universities possess hundreds of laboratory computers that remain idle for long periods outside scheduled classes.

Students often face challenges such as:

- Limited laboratory access
- Restricted opening hours
- High demand during assignment periods
- Inability to run specialized software from home
- Underutilized institutional computing resources

ComputeX addresses these challenges by providing secure remote access to available laboratory computers through an intelligent coordination system.

---

# 🚀 Solution

ComputeX enables students to:

- Authenticate securely
- Request a computing session
- Be assigned an available host computer
- Access the remote desktop through a browser
- Track computing credits
- View session history
- End sessions safely

Meanwhile, the system automatically:

- Registers available host machines
- Monitors host health
- Manages isolated guest sessions
- Records audit logs
- Calculates usage credits
- Cleans up sessions after completion

---

# ✨ Core Features

## 👨‍🎓 Student Portal

- Secure Authentication
- Dashboard
- Credit Balance
- Start Remote Session
- End Session
- Session History
- Profile Management
- Notifications

---

## 🖥️ Host Management

- Host Registration
- Health Monitoring
- Automatic Availability Reporting
- Host Status Tracking
- Resource Monitoring
- Session Assignment

---

## ⚙️ Coordinator Server

- User Authentication
- Session Lifecycle Management
- Host Matchmaking
- Credit Accounting
- REST API
- Audit Logging
- Role-Based Access Control

---

## 📊 Dashboard

- Active Sessions
- Available Hosts
- Session Statistics
- Credits Used
- Credits Remaining
- Recent Activities

---

## 🔐 Security Features

- Authentication
- Session Isolation
- Role-Based Authorization
- Audit Logs
- Secure API Communication
- Automatic Session Cleanup

---

# 🏗️ System Architecture

```
                    +----------------------+
                    |     React Client     |
                    +----------+-----------+
                               |
                               |
                     REST API Requests
                               |
                               ▼
                 +----------------------------+
                 |     Node.js Coordinator    |
                 +----------------------------+
                    |       |          |
                    |       |          |
                    ▼       ▼          ▼
               MongoDB   Python    Session
               Database  Host Agent Management
                    |
                    ▼
          University Laboratory PCs
```

---

# 🛠️ Technology Stack

## Frontend

- React
- React Router
- Axios
- CSS / Tailwind CSS

---

## Backend

- Node.js
- Express.js
- REST API

---

## Database

- MongoDB
- Mongoose

---

## Host Agent

- Python

Responsible for:

- Host Registration
- Health Monitoring
- Session Provisioning
- Cleanup

---

## Tools

- Git
- GitHub
- VS Code
- Postman
- Docker

---

# 📂 Project Structure

```text
ComputeX/
│
├── client/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── server/
│   ├── controllers/
│   ├── routes/
│   ├── models/
│   ├── middleware/
│   └── package.json
│
├── host-agent/
│   ├── monitor.py
│   ├── session.py
│   └── registration.py
│
├── docs/
├── screenshots/
└── README.md
```

---

# ⚙️ Installation

## Clone Repository

```bash
git clone https://github.com/Sitrasultan/ComputeX.git
```

---

## Install Frontend

```bash
cd client
npm install
npm run dev
```

---

## Install Backend

```bash
cd server
npm install
npm run dev
```

---

## Install Host Agent

```bash
cd host-agent
pip install -r requirements.txt
python monitor.py
```

---



# 📈 Workflow

1. Student logs into ComputeX.
2. User requests a remote session.
3. Coordinator verifies available credits.
4. Coordinator selects an available host.
5. Host Agent provisions an isolated session.
6. User accesses the remote desktop through the browser.
7. Usage is monitored throughout the session.
8. Credits are deducted based on session duration.
9. Session ends and resources are cleaned up automatically.
10. Session details are stored for auditing and reporting.

---

# 👩‍💻 My Contributions

As **Project Leader** and **Backend Developer**, I was responsible for:

- Designing the overall system architecture
- Leading project planning and coordination
- Developing RESTful APIs
- Building authentication and authorization
- Implementing session lifecycle management
- Designing MongoDB database schemas
- Developing dashboard APIs
- Integrating frontend with backend
- Implementing credit accounting
- Managing Git version control
- Coordinating team development

---

# 🎓 Learning Outcomes

This project strengthened my skills in:

- Distributed Systems
- Full Stack Development
- React Development
- Node.js
- Express.js
- MongoDB
- Python
- REST API Design
- Authentication
- System Architecture
- Backend Development
- Project Leadership
- Team Collaboration
- Software Engineering Principles

---

# 🚧 Future Improvements

Future versions may include:

- Docker orchestration
- Kubernetes deployment
- AI-based host selection
- WebRTC optimization
- File synchronization
- Clipboard sharing
- Real-time monitoring dashboard
- Multi-factor authentication
- Email notifications
- Session recording
- Usage analytics
- Cloud deployment
- Mobile application

---

# 👥 Team

**Project Leader & Backend Developer**

- **Sitra Sultan**

Additional team members contributed to frontend development, host-agent implementation, testing, documentation, and UI design.

---

# 📄 License

This project was developed as a Final Year Project for academic and research purposes.

---

# 👩‍💻 Author

**Sitra Sultan**

- GitHub: https://github.com/Sitrasultan
- LinkedIn: *(Add your LinkedIn profile)*
- Portfolio: *(Add your portfolio URL once deployed)*

---

⭐ **If you find this project interesting, please consider giving it a star on GitHub!**
