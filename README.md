
# ORBIT — Agentic Study Planner

## Overview

ORBIT is an agentic AI study planner that converts a user's learning goal into a structured, prioritised study plan. It uses Google's Gemini model and the Interactions API to reason through a planning workflow and invoke executable tools.

## Problem Statement

Students often struggle to divide large academic goals into realistic daily tasks, prioritise difficult topics, and review whether a plan covers the required material.

ORBIT helps by generating actionable study tasks, organising them by priority, checking the resulting task list, reflecting on potential gaps, and producing a final report.

## Objectives

- Convert natural-language goals into structured study tasks.
- Respect the user's available hours and planning horizon.
- Use AI function calling to execute tools.
- Prioritise tasks and identify schedule risks.
- Generate a readable study plan and final report.

## Agent Workflow

1. Receive the user's goal and constraints.
2. Analyse the planning requirements.
3. Call `create_tasks` to generate tasks.
4. Call `list_tasks` to inspect the plan.
5. Call `prioritize_tasks` to organise tasks.
6. Call `reflect_progress` to identify risks and gaps.
7. Call `write_report` to generate the final report.

## Tools

| Tool | Purpose |
|---|---|
| `create_tasks` | Creates structured study tasks |
| `list_tasks` | Inspects current tasks and completion status |
| `prioritize_tasks` | Sorts tasks by priority |
| `reflect_progress` | Reviews progress and identifies risks |
| `write_report` | Generates the final report |

## Technology Stack

- HTML
- CSS
- JavaScript
- Google Gemini API
- Gemini Interactions API
- Function calling / tool execution
- GitHub

## Project Files

- `index.html` — User interface
- `style.css` — Visual design
- `app.js` — Agent loop, API calls, and tool implementations
- `agent-schema.json` — Tool schema for documentation and submission
- `README.md` — Project documentation

## Setup

1. Open the project locally or deploy it using a static hosting service.
2. Obtain a Gemini API key from https://aistudio.google.com/apikey.
3. Open the application and enter the API key in the password field.
4. Enter a study goal, available hours per day, and planning horizon.
5. Select **Run agent**.
6. Review the agent activity, task board, and report.

## Security

Do not commit API keys to the repository. This is a browser-based demonstration, so API requests are made from the browser and the key is visible to the person using the application. For a production deployment, use a backend server to protect the API key and enforce usage limits.

## Limitations

- The task board exists in browser memory and resets when the page is refreshed.
- Generated plans should be reviewed by the student.
- The app requires a valid API key, network access, and model/API availability.
- This is an educational demonstration rather than a production study-management system.

## Future Improvements

- Persistent storage for tasks.
- Calendar integration.
- Progress charts.
- Automatic schedule adjustment.
- Backend API-key protection.

## Author

Student project — Agentic AI
